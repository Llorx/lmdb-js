import { fileURLToPath } from './deps.ts';
import { orderedBinary, setNativeFunctions, instrument } from './external.js';
orderedBinary.enableNullTermination();
// probably use Deno.build.os
let version = import.meta.url.match(/@([^/]+)\//)?.[1];
//console.log({version});
let libPath = import.meta.url.startsWith('file:') && fileURLToPath(new URL('build/Release/lmdb.node', import.meta.url));
if (!libPath || !exists(libPath)) {
    //console.log({ libPath }, 'does not exist')
    libPath = (Deno.env.get('LMDB_LIB_PATH') || (tmpdir() + '/lmdb-js-' + (version || '') + '.lib')) as string;
    const ARCH = { x86_64: 'x64', aarch64: 'arm64' }
    if (!exists(libPath)) {
        let os: string = Deno.build.os;
        os = os == 'windows' ? 'win32' : os;
        os += '-' + ARCH[Deno.build.arch];
        let libraryUrl = 'https://cdn.jsdelivr.net/npm/lmdb@' + (version || 'latest') +
            '/prebuilds/' + os + '/node.abi93.node';
        console.log('Download', libraryUrl);
        let response = await fetch(libraryUrl);
        if (response.status == 200) {
            let binaryLibraryBuffer = await response.arrayBuffer();
            Deno.writeFileSync(libPath, new Uint8Array(binaryLibraryBuffer));            
        } else {
            throw new Error('Unable to fetch ' + libraryUrl + ', HTTP response: ' + response.status);
        }
    }
}
let lmdbLib = Deno.dlopen(libPath, {
    // const char* path, char* keyBuffer, Compression* compression, int jsFlags, int flags, int maxDbs,
    // int maxReaders, mdb_size_t mapSize, int pageSize, char* encryptionKey
	envOpen: { parameters: ['u32', 'u32', 'buffer', 'buffer', 'f64', 'u32', 'u32', 'usize', 'u32', 'buffer'], result: 'i64'},
    closeEnv: { parameters: ['f64'], result: 'void'},
    freeData: { parameters: ['f64'], result: 'void'},
    getAddress: { parameters: ['buffer'], result: 'usize'},
    getMaxKeySize: { parameters: ['f64'], result: 'u32'},
    openDbi: { parameters: ['f64', 'u32', 'buffer', 'u32', 'f64'], result: 'i64'},
    getDbi: { parameters: ['f64'], result: 'u32'},
    readerCheck: { parameters: ['f64'], result: 'i32'},
    beginTxn: { parameters: ['f64', 'u32'], result: 'i64'},
    resetTxn: { parameters: ['f64'], result: 'void'},
    renewTxn: { parameters: ['f64'], result: 'i32'},
    abortTxn: { parameters: ['f64'], result: 'void'},
    commitEnvTxn: { parameters: ['f64'], result: 'i32'},
    abortEnvTxn: { parameters: ['f64'], result: 'void'},
    getError: { parameters: ['i32', 'buffer'], result: 'void'},
    dbiGetByBinary: { parameters: ['f64', 'u32'], result: 'u32'},    
    openCursor: { parameters: ['f64'], result: 'i64'},
    cursorRenew: { parameters: ['f64'], result: 'i32'},
    cursorClose: { parameters: ['f64'], result: 'i32'},
    cursorIterate: { parameters: ['f64'], result: 'i32'},
    cursorPosition: { parameters: ['f64', 'u32', 'u32', 'u32', 'f64'], result: 'i32'},
    cursorCurrentValue: { parameters: ['f64'], result: 'i32'},
    startWriting: { parameters: ['f64', 'f64'], nonblocking: true, result: 'i32'},
    compress: { parameters: ['f64', 'f64'], nonblocking: true, result: 'void'},
    envWrite: { parameters: ['f64', 'f64'], result: 'i32'},
    setGlobalBuffer: { parameters: ['buffer', 'usize'], result: 'void'},
    setCompressionBuffer: { parameters: ['f64', 'buffer', 'usize', 'u32'], result: 'void'},
    newCompression: { parameters: ['buffer', 'usize', 'u32'], result: 'u64'},
});
//instrument(lmdbLib.symbols);

let { envOpen, closeEnv, getAddress, freeData, getMaxKeySize, openDbi, getDbi, readerCheck,
    commitEnvTxn, abortEnvTxn, beginTxn, resetTxn, renewTxn, abortTxn, dbiGetByBinary, startWriting, compress, envWrite, openCursor, cursorRenew, cursorClose, cursorIterate, cursorPosition, cursorCurrentValue, setGlobalBuffer: setGlobalBuffer2, setCompressionBuffer, getError, newCompression } = lmdbLib.symbols;
let registry = new FinalizationRegistry(address => {
    // when an object is GC'ed, free it in C.
    console.log('freeData',address)
    freeData(address);
});

class CBridge {
    address: number;
    constructor(address: number) {
        this.address = address || 0;
        if (address) {
            registry.register(this, address);
        }
    }
  /*  static addMethods(...methods: ) {
        for (let method of methods) {
            this.prototype[method] = function() {
                return symbols[method](this.address, ...arguments);
            };
        }
    }*/
}
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const MAX_ERROR = 1000;
function checkError(rc: number): number {
    if (rc && rc < MAX_ERROR) {
        // TODO: Look up error and throw
        lmdbError(rc);
    }
    return rc;
}
function lmdbError(rc: number) {
    getError(rc, keyBytes);
    let message = textDecoder.decode(keyBytes.subarray(0, keyBytes.indexOf(0))) || ('Error code: ' + rc);
    throw new Error(message);
}
let keyBytes: Uint8Array;
class Env extends CBridge {
    open(options: any, flags: number, jsFlags: number) {
        let rc = envOpen(flags, jsFlags, toCString(options.path), keyBytes = options.keyBytes, 0,
            options.maxDbs || 12, options.maxReaders || 126, options.mapSize, options.pageSize, new Uint8Array(0)) as number;
        this.address = checkError(rc);
        registry.register(this, this.address);
        return 0;
    }
    openDbi(options: any) {
        let flags = (options.reverseKey ? 0x02 : 0) |
            (options.dupSort ? 0x04 : 0) |
            (options.dupFixed ? 0x08 : 0) |
            (options.integerDup ? 0x20 : 0) |
            (options.reverseDup ? 0x40 : 0) |
            (options.create ? 0x40000 : 0) |
            (options.useVersions ? 0x1000 : 0);
        let keyType = (options.keyIsUint32 || options.keyEncoding == 'uint32') ? 2 :
            (options.keyIsBuffer || options.keyEncoding == 'binary') ? 3 : 0;
        let rc: number = openDbi(this.address, flags, toCString(options.name), keyType, options.compression?.address || 0) as number;
        if (rc == -30798) { // MDB_NOTFOUND
            console.log('dbi not found, need to try again with write txn');
        }
        return new Dbi(checkError(rc),
            getDbi(rc) as number);
    }
    close() {
        closeEnv(this.address);
    }
    getMaxKeySize() {
        return getMaxKeySize(this.address);
    }
    readerCheck() {
        return readerCheck(this.address);
    }
    beginTxn(flags: number) {
        let rc: number = beginTxn(this.address, flags) as number;
        return new Transaction(checkError(rc), flags);
    }
    commitTxn() {
        checkError(commitEnvTxn(this.address) as number);
    }
    abortTxn() {
        abortEnvTxn(this.address);
    }
    startWriting(instructions: number, callback: (value: number) => number) {
        (startWriting(this.address, instructions) as Promise<number>).then(callback);
    }
    compress(compressionPointer: number, callback: (value: void) => void) {
        return (compress(this.address, compressionPointer) as  Promise<void>).then(callback);
    }
    write(instructions: number) {
        return checkError(envWrite(this.address, instructions) as number);
    }
}
//Env.addMethods('startWriting', 'write', 'openDB');
class Dbi extends CBridge {
    dbi: number;
    constructor(address: number, dbi: number) {
        super(address);
        this.dbi = dbi;
    }
    getByBinary(keySize: number): number {
        return dbiGetByBinary(this.address, keySize) as number;
    }
}
class Transaction extends CBridge {
    flags: number;
    constructor(address: number, flags: number) {
        super(address);
        this.flags = flags;
    }
    reset() {
        resetTxn(this.address);
    }
    renew() {
        let rc = renewTxn(this.address) as number;
        if (rc)
            lmdbError(rc);
    }
    abort() {
        abortTxn(this.address);
    }
}


class Compression extends CBridge {
    constructor(options: { dictionary: Uint8Array, threshold: number }) {
        let dictionary = options.dictionary || new Uint8Array(0);
        super(newCompression(dictionary, dictionary.length, options.threshold || 1000) as number);
    }
    setBuffer(bytes: Uint8Array, dictLength: number) {
        setCompressionBuffer(this.address, bytes, bytes.length, dictLength);
    }
}
class Cursor extends CBridge {
    constructor(dbi: Dbi) {
        super(openCursor(dbi.address) as number);
    }
    renew() {
        cursorRenew(this.address);
    }
    position(flags: number, offset: number, keySize: number, endKeyAddress: number) {
        return cursorPosition(this.address, flags, offset, keySize, endKeyAddress);
    }
    iterate() {
        return cursorIterate(this.address);
    }
    getCurrentValue() {
        return cursorCurrentValue(this.address);
    }
    close() {
        return cursorClose(this.address);
    }
}
function toCString(str: string): Uint8Array {
    return str == null ? new Uint8Array(0) : textEncoder.encode(str + '\x00');
}
function setGlobalBuffer(buffer: Uint8Array) {
    setGlobalBuffer2(buffer, buffer.length);
}

setNativeFunctions({ Env, Compression, Cursor, getAddress, lmdbError, setGlobalBuffer });
export const { toBufferKey: keyValueToBuffer, compareKeys, compareKeys: compareKey, fromBufferKey: bufferToKeyValue } = orderedBinary;
export { ABORT, asBinary, IF_EXISTS } from './write.js';
export { levelup } from './level.js';
export { open, getLastVersion } from './open.js';

// inlined from https://github.com/denoland/deno_std/blob/main/node/os.ts
function tmpdir(): string | null {
    /* This follows the node js implementation, but has a few
       differences:
       * On windows, if none of the environment variables are defined,
         we return null.
       * On unix we use a plain Deno.env.get, instead of safeGetenv,
         which special cases setuid binaries.
       * Node removes a single trailing / or \, we remove all.
    */
    if (Deno.build.os == 'windows') {
      const temp = Deno.env.get("TEMP") || Deno.env.get("TMP");
      if (temp) {
        return temp.replace(/(?<!:)[/\\]*$/, "");
      }
      const base = Deno.env.get("SYSTEMROOT") || Deno.env.get("WINDIR");
      if (base) {
        return base + "\\temp";
      }
      return null;
    } else { // !isWindows
      const temp = Deno.env.get("TMPDIR") || Deno.env.get("TMP") ||
        Deno.env.get("TEMP") || "/tmp";
      return temp.replace(/(?<!^)\/*$/, "");
    }
}
function exists(path: string): boolean {
    try {
        return Boolean(Deno.statSync(path));
    } catch (error) {
        if (error.name == 'NotFound')
			return false
        throw error
    }
}
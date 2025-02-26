import { getAddress, orderedBinary } from './external.js';

const writeUint32Key = (key, target, start) => {
	(target.dataView || (target.dataView = new DataView(target.buffer, 0, target.length))).setUint32(start, key, true);
	return start + 4;
};
const readUint32Key = (target, start) => {
	return (target.dataView || (target.dataView = new DataView(target.buffer, 0, target.length))).getUint32(start, true);
};
const writeBufferKey = (key, target, start) => {
	target.set(key, start);
	return key.length + start;
};
const Uint8ArraySlice = Uint8Array.prototype.slice;
const readBufferKey = (target, start, end) => {
	return Uint8ArraySlice.call(target, start, end);
};

export function applyKeyHandling(store) {
 	if (store.encoding == 'ordered-binary') {
		store.encoder = store.decoder = {
			writeKey: orderedBinary.writeKey,
			readKey: orderedBinary.readKey,
		};
	}
	if (store.encoder && store.encoder.writeKey && !store.encoder.encode) {
		store.encoder.encode = function(value) {
			return saveKey(value, this.writeKey, false, store.maxKeySize);
		};
	}
	if (store.decoder && store.decoder.readKey && !store.decoder.decode)
		store.decoder.decode = function(buffer) { return this.readKey(buffer, 0, buffer.length); };
	if (store.keyIsUint32 || store.keyEncoding == 'uint32') {
		store.writeKey = writeUint32Key;
		store.readKey = readUint32Key;
	} else if (store.keyIsBuffer || store.keyEncoding == 'binary') {
		store.writeKey = writeBufferKey;
		store.readKey = readBufferKey;
	} else if (store.keyEncoder) {
		store.writeKey = store.keyEncoder.writeKey;
		store.readKey = store.keyEncoder.readKey;
	} else {
		store.writeKey = orderedBinary.writeKey;
		store.readKey = orderedBinary.readKey;
	}
}

let saveBuffer, saveDataView, saveDataAddress;
let savePosition = 8000;
let DYNAMIC_KEY_BUFFER_SIZE = 8192;
function allocateSaveBuffer() {
	saveBuffer = typeof Buffer != 'undefined' ? Buffer.alloc(DYNAMIC_KEY_BUFFER_SIZE) : new Uint8Array(DYNAMIC_KEY_BUFFER_SIZE);
	saveBuffer.dataView = saveDataView = new DataView(saveBuffer.buffer, saveBuffer.byteOffset, saveBuffer.byteLength);
	saveBuffer.buffer.address = getAddress(saveBuffer);
	saveDataAddress = saveBuffer.buffer.address;
	savePosition = 0;
}
export function saveKey(key, writeKey, saveTo, maxKeySize) {
	if (savePosition > 7800) {
		allocateSaveBuffer();
	}
	let start = savePosition;
	try {
		savePosition = key === undefined ? start + 4 :
			writeKey(key, saveBuffer, start + 4);
	} catch (error) {
		saveBuffer.fill(0, start + 4); // restore zeros
		if (error.name == 'RangeError') {
			if (8188 - start < maxKeySize) {
				allocateSaveBuffer(); // try again:
				return saveKey(key, writeKey, saveTo, maxKeySize);
			}
			throw new Error('Key was too large, max key size is ' + maxKeySize);
		} else
			throw error;
	}
	let length = savePosition - start - 4;
	if (length > maxKeySize) {
		throw new Error('Key of size ' + length + ' was too large, max key size is ' + maxKeySize);
	}
	if (saveTo) {
		saveDataView.setUint32(start, length, true); // save the length
		saveTo.saveBuffer = saveBuffer;
		savePosition = (savePosition + 16) & 0xfffff8;
		return start + saveDataAddress;
	} else {
		saveBuffer.start = start + 4
		saveBuffer.end = savePosition
		savePosition = (savePosition + 7) & 0xfffff8;
		return saveBuffer
	}
}

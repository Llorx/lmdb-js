import path from 'path';
import rimraf from 'rimraf';
import chai from 'chai';
let should = chai.should();
let expect = chai.expect;
import { spawn } from 'child_process';
import { unlinkSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { encoder as orderedBinaryEncoder } from 'ordered-binary/index.js'
import inspector from 'inspector'
//inspector.open(9330, null, true); debugger
let nativeMethods, dirName = dirname(fileURLToPath(import.meta.url))

import { open, levelup, bufferToKeyValue, keyValueToBuffer, asBinary, ABORT, IF_EXISTS } from '../node-index.js';
import { RangeIterable } from '../util/RangeIterable.js'

describe('lmdb-js', function() {
  let testDirPath = path.resolve(dirName, './testdata-ls');

  // just to make a reasonable sized chunk of data...
  function expand(str) {
    str = '(' + str + ')';
    str = str + str;
    str = str + str;
    str = str + str;
    str = str + str;
    str = str + str;
    return str;
  }
  before(function(done) {
    // cleanup previous test directory
    rimraf(testDirPath, function(err) {
      if (err) {
        return done(err);
      }
      done();
    });
  });
  let testIteration = 0
  describe('Basic use', basicTests({ }));
  describe('Basic use with overlapping sync', basicTests({ overlappingSync: true }));
  describe('Basic use with encryption', basicTests({ compression: false, encryptionKey: 'Use this key to encrypt the data' }));
  describe('Check encrypted data', basicTests({ compression: false, encryptionKey: 'Use this key to encrypt the data', checkLast: true }));
  describe('Basic use with JSON', basicTests({ encoding: 'json' }));
  describe('Basic use with ordered-binary', basicTests({ encoding: 'ordered-binary' }));
  if (typeof WeakRef != 'undefined')
    describe('Basic use with caching', basicTests({ cache: true }));
  function basicTests(options) { return function() {
    this.timeout(1000000);
    let db, db2, db3;
    before(function() {
      if (!options.checkLast)
        testIteration++;
      db = open(testDirPath + '/test-' + testIteration + '.mdb', Object.assign({
        name: 'mydb3',
        create: true,
        useVersions: true,
        batchStartThreshold: 10,
        //asyncTransactionOrder: 'strict',
        //useWritemap: true,
        //noSync: true,
        //overlappingSync: true,
        maxReaders: 100,
        eventTurnBatching: true,
        keyEncoder: orderedBinaryEncoder,
        compression: {
          threshold: 256,
        },
      }, options));
      if (!options.checkLast)
        db.clearSync();
      db2 = db.openDB(Object.assign({
        name: 'mydb4',
        create: true,
        dupSort: true,
      }));
      if (!options.checkLast)
        db2.clearSync();
      db3 = db.openDB({
        name: 'mydb5',
        create: true,
        dupSort: true,
        encoding: 'ordered-binary',
      });
      if (!options.checkLast)
        db3.clearSync();
    });
    if (options.checkLast) {
      it('encrypted data can not be accessed', function() {
        let data = db.get('key1');
        console.log({data})
        data.should.deep.equal('test')
      })
      return
    }
    it('zero length values', async function() {
      db.put(5, asBinary(Buffer.from([])));
      await db2.put('key1', asBinary(Buffer.from([])));
      should.equal(db.getBinary(5).length, 0);
      should.equal(db2.getBinary('key1').length, 0);
      db.put(5, asBinary(Buffer.from([4])));
      db2.remove('key1');
      await db2.put('key1', asBinary(Buffer.from([4])));
      should.equal(db.getBinary(5).length, 1);
      should.equal(db2.getBinary('key1').length, 1);
      db.put(5, asBinary(Buffer.from([])));
      db2.remove('key1');
      await db2.put('key1', asBinary(Buffer.from([])));
      should.equal(db.getBinary(5).length, 0);
      should.equal(db2.getBinary('key1').length, 0);
      await db2.remove('key1');
    });
    it('query of keys', async function() {
      let keys = [
        Symbol.for('test'),
        false,
        true,
        -33,
        -1.1,
        3.3,
        5,
        [5,4],
        [5,55],
        [5, 'words after number'],
        [6, 'abc'],
        [ 'Test', null, 1 ],
        [ 'Test', Symbol.for('test'), 2 ],
        [ 'Test', 'not null', 3 ],
        'hello',
        ['hello', 3],
        ['hello', 'world'],
        [ 'uid', 'I-7l9ySkD-wAOULIjOEnb', 'Rwsu6gqOw8cqdCZG5_YNF' ],
        'z'
      ]
      for (let key of keys) {
        await db.put(key, 3);
      }
      let returnedKeys = []
      for (let { key, value } of db.getRange({
        start: Symbol.for('A')
      })) {
        returnedKeys.push(key)
        value.should.equal(db.get(key))
      }
      keys.should.deep.equal(returnedKeys)

      returnedKeys = []
      for (let { key, value } of db.getRange({
        reverse: true,
      })) {
        returnedKeys.unshift(key)
        value.should.equal(db.get(key))
      }
      keys.should.deep.equal(returnedKeys)
    });
    it('reverse query range', async function() {
      const keys = [
        [ 'Test', 100, 1 ],
        [ 'Test', 10010, 2 ],
        [ 'Test', 10010, 3 ]
      ]
      for (let key of keys)
        db.put(key, 3);
      await db;
      for (let { key, value } of db.getRange({
        start: ['Test', null],
        end: ['Test', null],
        reverse: true
      })) {
        throw new Error('Should not return any results')
      }
    })
    it('more reverse query range', async function() {
      db.putSync('0Sdts8FwTqt2Hv5j9KE7ebjsQcFbYDdL/0Sdtsud6g8YGhPwUK04fRVKhuTywhnx8', 1, 1, null);
      db.putSync('0Sdts8FwTqt2Hv5j9KE7ebjsQcFbYDdL/0Sdu0mnkm8lS38yIZa4Xte3Q3JUoD84V', 1, 1, null);
      const options =
      {
        start: '0Sdts8FwTqt2Hv5j9KE7ebjsQcFbYDdL/0SdvKaMkMNPoydWV6HxZbFtKeQm5sqz3',
        end: '0Sdts8FwTqt2Hv5j9KE7ebjsQcFbYDdL/00000000dKZzSn03pte5dWbaYfrZl4hG',
        reverse: true
      };
      let returnedKeys = Array.from(db.getKeys(options))
      returnedKeys.should.deep.equal(['0Sdts8FwTqt2Hv5j9KE7ebjsQcFbYDdL/0Sdu0mnkm8lS38yIZa4Xte3Q3JUoD84V', '0Sdts8FwTqt2Hv5j9KE7ebjsQcFbYDdL/0Sdtsud6g8YGhPwUK04fRVKhuTywhnx8'])
    });
    it('clear between puts', async function() {
      db.put('key0', 'zero')
      db.clearAsync()
      await db.put('key1', 'one')
      should.equal(db.get('key0'), undefined)
      should.equal(db.get('hello'), undefined)
      should.equal(db.get('key1'), 'one')
    })
    it('string', async function() {
      await db.put('key1', 'Hello world!');
      let data = db.get('key1');
      data.should.equal('Hello world!');
      await db.remove('key1')
      let data2 = db.get('key1');
      should.equal(data2, undefined);
    });
    it('string with version', async function() {
      await db.put('key1', 'Hello world!', 53252);
      let entry = db.getEntry('key1');
      entry.value.should.equal('Hello world!');
      entry.version.should.equal(53252);
      (await db.remove('key1', 33)).should.equal(false);
      entry = db.getEntry('key1');
      entry.value.should.equal('Hello world!');
      entry.version.should.equal(53252);
      (await db.remove('key1', 53252)).should.equal(true);
      entry = db.getEntry('key1');
      should.equal(entry, undefined);
    });
    it('string with version branching', async function() {
      await db.put('key1', 'Hello world!', 53252);
      let entry = db.getEntry('key1');
      entry.value.should.equal('Hello world!');
      entry.version.should.equal(53252);
      (await db.ifVersion('key1', 777, () => {
        db.put('newKey', 'test', 6);
        db2.put('keyB', 'test', 6);
      })).should.equal(false);
      should.equal(db.get('newKey'), undefined);
      should.equal(db2.get('keyB'), undefined);
      let result = (await db.ifVersion('key1', 53252, () => {
        db.put('newKey', 'test', 6);
        db2.put('keyB', 'test', 6);
      }))
      should.equal(db.get('newKey'), 'test')
      should.equal(db2.get('keyB'), 'test')
      should.equal(result, true);
      result = await db.ifNoExists('key1', () => {
        db.put('newKey', 'changed', 7);
      })
      should.equal(db.get('newKey'), 'test');
      should.equal(result, false);
      result = await db.ifNoExists('key-no-exist', () => {
        db.put('newKey', 'changed', 7);
      })
      should.equal(db.get('newKey'), 'changed')
      should.equal(result, true);

      result = await db2.ifVersion('key-no-exist', IF_EXISTS, () => {
        db.put('newKey', 'changed again', 7);
      })
      should.equal(db.get('newKey'), 'changed')
      should.equal(result, false);

      result = await db2.ifVersion('keyB', IF_EXISTS, () => {
        db.put('newKey', 'changed again', 7);
      })
      should.equal(db.get('newKey'), 'changed again')
      should.equal(result, true);

      result = await db2.remove('key-no-exists');
      should.equal(result, true);
      result = await db2.remove('key-no-exists', IF_EXISTS);
      should.equal(result, false);
    });
    it('string with compression and versions', async function() {
      let str = expand('Hello world!')
      await db.put('key1', str, 53252);
      let entry = db.getEntry('key1');
      entry.value.should.equal(str);
      entry.version.should.equal(53252);
      (await db.remove('key1', 33)).should.equal(false);
      let data = db.get('key1');
      data.should.equal(str);
      (await db.remove('key1', 53252)).should.equal(true);
      data = db.get('key1');
      should.equal(data, undefined);
    });
    it('repeated compressions', async function() {
      let str = expand('Hello world!')
      db.put('key1', str, 53252);
      db.put('key1', str, 53253);
      db.put('key1', str, 53254);
      await db.put('key1', str, 53255);
      let entry = db.getEntry('key1');
      entry.value.should.equal(str);
      entry.version.should.equal(53255);
      (await db.remove('key1')).should.equal(true);
    });

    it('forced compression due to starting with 255', async function() {
      await db.put('key1', asBinary(Buffer.from([255])));
      let entry = db.getBinary('key1');
      entry.length.should.equal(1);
      entry[0].should.equal(255);
      (await db.remove('key1')).should.equal(true);
    });
    if (options.encoding == 'ordered-binary')
      return // no more tests need to be applied for this
    it('store objects', async function() {
      let dataIn = {foo: 3, bar: true}
      await db.put('key1',  dataIn);
      let dataOut = db.get('key1');
      dataOut.should.deep.equal(dataIn);
      db.removeSync('not-there').should.equal(false);
    });
    it('store binary', async function() {
      let dataIn = {foo: 4, bar: true}
      let buffer = db.encoder.encode(dataIn);
      if (typeof buffer == 'string')
        return
      await db.put('key1', asBinary(buffer));
      let dataOut = db.get('key1');
      dataOut.should.deep.equal(dataIn);
    });
    it('writes batch with callback', async function() {
      let dataIn = {name: 'for batch 1'}
      await db.batch(() => {
        db.put('key1', dataIn);
        db.put('key2', dataIn);
      })
    })
    it.skip('trigger sync commit', async function() {
      let dataIn = {foo: 4, bar: false}
      db.immediateBatchThreshold = 1
      db.syncBatchThreshold = 1
      await db.put('key1',  dataIn);
      await db.put('key2',  dataIn);
      db.immediateBatchThreshold = 100000
      db.syncBatchThreshold = 1000000
      let dataOut = db.get('key1');
      dataOut.should.deep.equal(dataIn);
    });
    function iterateQuery(acrossTransactions) { return async () => {
      let data1 = {foo: 1, bar: true}
      let data2 = {foo: 2, bar: false}
      db.put('key1',  data1);
      db.put('key2',  data2);
      await db;
      let count = 0
      for (let { key, value } of db.getRange({start:'key', end:'keyz', snapshot: !acrossTransactions})) {
        if (acrossTransactions)
          await delay(10)
        count++
        switch(key) {
          case 'key1': data1.should.deep.equal(value); break;
          case 'key2': data2.should.deep.equal(value); break;
        }
      }
      should.equal(count >= 2, true);
      should.equal(db.getCount({start:'key', end:'keyz'}) >= 2, true);
    }}
    it('should iterate over query', iterateQuery(false));
    it('should iterate over query, across transactions', iterateQuery(true));
    it('should break out of query', async function() {
      let data1 = {foo: 1, bar: true}
      let data2 = {foo: 2, bar: false}
      db.put('key1',  data1);
      db.put('key2',  data2);
      await db;
      let count = 0;
      for (let { key, value } of db.getRange({start:'key', end:'keyz'})) {
        if (count > 0)
          break;
        count++;
        data1.should.deep.equal(value);
        'key1'.should.equal(key);
      }
      count.should.equal(1);
    });
    it('getRange with arrays', async function() {
      const keys = [
        [ 'foo', 0 ],
        [ 'foo', 1 ],
        [ 'foo', 2 ],
      ]
      let promise
      keys.forEach((key, i) => {
        promise = db.put(key, i)
      })
      await promise

      let result = Array.from(db.getRange({
        start: [ 'foo'],
        end: [ 'foo', 1 ],
      }))
      result.should.deep.equal([ { key: [ 'foo', 0 ], value: 0 } ])

      result = Array.from(db.getRange({
        start: [ 'foo', 0 ],
        end: [ 'foo', 1 ],
      }))
      result.should.deep.equal([ { key: [ 'foo', 0 ], value: 0 } ])

      result = Array.from(db.getRange({
        start: [ 'foo', 2 ],
        end: [ 'foo', [2, null] ],
      }))
      result.should.deep.equal([ { key: [ 'foo', 2 ], value: 2 } ])
    })
    it('should iterate over query with offset/limit', async function() {
      let data1 = {foo: 1, bar: true}
      let data2 = {foo: 2, bar: false}
      let data3 = {foo: 3, bar: false}
      db.put('key1',  data1);
      db.put('key2',  data2);
      await db.put('key3',  data3);
      let count = 0
      for (let { key, value } of db.getRange({start:'key', end:'keyz', offset: 1, limit: 1})) {
        count++
        switch(key) {
          case 'key2': data2.should.deep.equal(value); break;
        }
      }
      count.should.equal(1)
      count = 0
      for (let { key, value } of db.getRange({start:'key', end:'keyz', offset: 3, limit: 3})) {
        count++
      }
      count.should.equal(0)
      for (let { key, value } of db.getRange({start:'key', end:'keyz', offset: 10, limit: 3})) {
        count++
      }
      count.should.equal(0)
      for (let { key, value } of db.getRange({start:'key', end:'keyz', offset: 2, limit: 3})) {
        count++
        switch(key) {
          case 'key3': data3.should.deep.equal(value); break;
        }
      }
      count.should.equal(1)
    });
    it('should handle open iterators and cursor renewal', async function() {
      let data1 = {foo: 1, bar: true};
      let data2 = {foo: 2, bar: false};
      let data3 = {foo: 3, bar: false};
      db2.put('key1',  data1);
      db.put('key1',  data1);
      db.put('key2',  data2);
      await db.put('key3',  data3);
      let it1 = db.getRange({start:'key', end:'keyz'})[Symbol.iterator]();
      let it2 = db2.getRange({start:'key', end:'keyz'})[Symbol.iterator]();
      let it3 = db.getRange({start:'key', end:'keyz'})[Symbol.iterator]();
      it1.return();
      it2.return();
      await new Promise(resolve => setTimeout(resolve, 10));
      it1 = db.getRange({start:'key', end:'keyz'})[Symbol.iterator]();
      it2 = db2.getRange({start:'key', end:'keyz'})[Symbol.iterator]();
      let it4 = db.getRange({start:'key', end:'keyz'})[Symbol.iterator]();
      let it5 = db2.getRange({start:'key', end:'keyz'})[Symbol.iterator]();
      await new Promise(resolve => setTimeout(resolve, 20));
      it4.return()
      it5.return()
      it1.return()
      it2.return()
      it3.return()
    });
    it('should iterate over dupsort query, with removal', async function() {
      let data1 = {foo: 1, bar: true}
      let data2 = {foo: 2, bar: false}
      let data3 = {foo: 3, bar: true}
      db2.put('key1',  data1);
      db2.put('key1',  data2);
      db2.put('key1',  data3);
      await db2.put('key2',  data3);
      let count = 0;
      for (let value of db2.getValues('key1')) {
        count++
        switch(count) {
          case 1: data1.should.deep.equal(value); break;
          case 2: data2.should.deep.equal(value); break;
          case 3: data3.should.deep.equal(value); break;
        }
      }
      count.should.equal(3);
      db2.getValuesCount('key1').should.equal(3);
      await db2.remove('key1',  data2);
      count = 0;
      for (let value of db2.getValues('key1')) {
        count++;
        switch(count) {
          case 1: data1.should.deep.equal(value); break;
          case 2: data3.should.deep.equal(value); break;
        }
      }
      count.should.equal(2)
      db2.getValuesCount('key1').should.equal(2);
      count = 0;
      for (let value of db2.getValues('key1', { reverse: true })) {
        count++;
        switch(count) {
          case 1: data3.should.deep.equal(value); break;
          case 2: data1.should.deep.equal(value); break;
        }
      }
      count.should.equal(2);
      db2.getValuesCount('key1').should.equal(2);

      count = 0;
      for (let value of db2.getValues('key0')) {
        count++;
      }
      count.should.equal(0);
      db2.getValuesCount('key0').should.equal(0);
      db2.getCount({start: 'key1', end: 'key3'}).should.equal(3);
    });
    it('should iterate over ordered-binary dupsort query with start/end', async function() {
      db3.put('key1',  1);
      db3.put('key1',  2);
      db3.put('key1',  3);
      await db3.put('key2',  3);
      let count = 0;
      for (let value of db3.getValues('key1', { start: 1 })) {
        count++
        value.should.equal(count)
      }
      count.should.equal(3);
      count = 0;
      for (let value of db3.getValues('key1', { end: 3 })) {
        count++
        value.should.equal(count)
      }
      count.should.equal(2);
    });
    it('should count ordered-binary dupsort query with start/end', async function() {
      db3.put('key1',  1);
      db3.put('key1',  2);
      db3.put('key1',  3);
      await db3.put('key2',  3);
      db3.getValuesCount('key1').should.equal(3);
      db3.getValuesCount('key1', { start: 1, end: 3 }).should.equal(2);
      db3.getValuesCount('key1', { start: 2, end: 3 }).should.equal(1);
      db3.getValuesCount('key1', { start: 2 }).should.equal(2);
      db3.getValuesCount('key1', { end: 2 }).should.equal(1);
      db3.getValuesCount('key1', { start: 1, end: 2 }).should.equal(1);
      db3.getValuesCount('key1', { start: 2, end: 2 }).should.equal(0);
      db3.getValuesCount('key1').should.equal(3);
    });
    it('should reverse iterate ordered-binary dupsort query with start/end', async function() {
      db3.put('key1',  1);
      db3.put('key1',  2);
      db3.put('key1',  3);
      await db3.put('key2',  3);
      let count = 0;
      for (let value of db3.getValues('key1', { reverse: true, start: 2 })) {
        count++;
        value.should.equal(3 - count);
      }
      count.should.equal(2);

      count = 0;
      for (let value of db3.getValues('key1', { reverse: true, start: 2.5 })) {
        count++;
        value.should.equal(3 - count);
      }
      count.should.equal(2);

      count = 0;
      for (let value of db3.getValues('key1', { reverse: true, start: 50 })) {
        count++;
        value.should.equal(4 - count);
      }
      count.should.equal(3);

      count = 0;
      for (let value of db3.getValues('key1', { reverse: true, start: 2, end: 1 })) {
        count++;
        value.should.equal(3 - count);
      }
      count.should.equal(1);

      count = 0;
      for (let value of db3.getValues('key1', { reverse: true, end: 1 })) {
        count++;
        value.should.equal(4 - count);
      }
      count.should.equal(2);

      count = 0;
      for (let value of db3.getValues('key1', { reverse: true, start: 0.5 })) {
        count++;
      }
      count.should.equal(0);

    });
    it('doesExist', async function() {
      let data1 = {foo: 1, bar: true}
      let data2 = {foo: 2, bar: false}
      let data3 = {foo: 3, bar: true}
      db2.put('key1',  data1);
      db2.put('key1',  data3);
      db2.put(false,  3);
      await db2.put('key2',  data3);
      should.equal(db2.doesExist('key1'), true);
      should.equal(db2.doesExist('key1', data1), true);
      should.equal(db2.doesExist('key1', data2), false);
      should.equal(db2.doesExist('key1', data3), true);
      should.equal(db2.doesExist(false), true);
      should.equal(db2.doesExist(false, 3), true);
      should.equal(db2.doesExist(false, 4), false);
    })
    it('should iterate over keys without duplicates', async function() {
      let lastKey
      for (let key of db2.getKeys({ start: 'k' })) {
        if (key == lastKey)
          throw new Error('duplicate key returned')
        lastKey = key
      }
    })
    it('big keys', async function() {
      let keyBase = ''
      for (let i = 0; i < 1900; i++) {
        keyBase += 'A'
      }
      let keys = []
      let promise
      for (let i = 40; i < 120; i++) {
        let key = String.fromCharCode(i) + keyBase
        keys.push(key)
        promise = db.put(key, i)
      }
      await promise
      let returnedKeys = []
      for (let { key, value } of db.getRange({})) {
        if (key.length > 1000) {
          returnedKeys.push(key)
          should.equal(key.charCodeAt(0), value)
          should.equal(db.get(key), value)
          promise = db.remove(key)
        }
      }
      returnedKeys.should.deep.equal(keys)
      await promise
      should.equal(db.get(returnedKeys[0]), undefined)
    });

    it('invalid key', async function() {
      expect(() => db.get(Buffer.from([]))).to.throw();
      expect(() => db.put(Buffer.from([]), 'test')).to.throw();
      expect(() => db.get({ foo: 'bar' })).to.throw();
      expect(() => db.put({ foo: 'bar' }, 'hello')).to.throw();
      expect(() => db.put('x'.repeat(4027), 'hello')).to.throw();
      expect(() => db2.put('x', 'x'.repeat(4027))).to.throw();
      Array.from(db.getRange({ start: 'x', end: Buffer.from([])}))
      //expect(() => Array.from(db.getRange({ start: 'x'.repeat(4027)}))).to.throw();
    });
    it('put options (sync)', function() {
      db.putSync('zkey6', 'test', { append: true, version: 33 });
      let entry = db.getEntry('zkey6');
      entry.value.should.equal('test');
      entry.version.should.equal(33);
      should.equal(db.putSync('zkey7', 'test', { append: true, noOverwrite: true }), true);
      should.equal(db2.putSync('zkey6', 'test1', { appendDup: true }), true);
      should.equal(db2.putSync('zkey6', 'test2', { appendDup: true }), true);
      should.equal(db.putSync('zkey5', 'test', { append: true, version: 44 }), false);
      should.equal(db.putSync('zkey7', 'test', { noOverwrite: true }), false);
      should.equal(db2.putSync('zkey6', 'test1', { noDupData: true }), false);
    });
    it('async transactions', async function() {
      let ranTransaction
      db.put('key1', 'async initial value'); // should be queued for async write, but should put before queued transaction
      let errorHandled
      if (!db.cache) {
        db.childTransaction(() => {
          db.put('key1',  'should be rolled back');
          throw new Error('Make sure this is properly propagated without interfering with next transaction')
        }).catch(error => {
          if (error)
            errorHandled = true
        })
        await db.childTransaction(() => {
          should.equal(db.get('key1'), 'async initial value');
          db.put('key-a',  'async test a');
          should.equal(db.get('key-a'), 'async test a');
        })
        should.equal(errorHandled, true);
      }
      await db.transactionAsync(() => {
        ranTransaction = true;
        should.equal(db.get('key1'), 'async initial value');
        db.put('key1',  'async test 1');
        should.equal(db.get('key1'), 'async test 1');
        for (let { key, value } of db.getRange({start: 'key1', end: 'key1z' })) {
          should.equal(value, 'async test 1');
        }
        db2.put('key2-async',  'async test 2');
        should.equal(db2.get('key2-async'), 'async test 2');
      });
      should.equal(db.get('key1'), 'async test 1');
      should.equal(db2.get('key2-async'), 'async test 2');
      should.equal(ranTransaction, true);
    });
    it('child transaction in sync transaction', async function() {
      if (db.cache)
        return
      await db.transactionSync(async () => {
        db.put('key3', 'test-sync-txn');
        db.childTransaction(() => {
          db.put('key3', 'test-child-txn');
          return ABORT;
        })
        should.equal(db.get('key3'), 'test-sync-txn');
        db.childTransaction(() => {
          db.put('key3', 'test-child-txn');
        })
        should.equal(db.get('key3'), 'test-child-txn');
        await db.childTransaction(async () => {
          await new Promise(resolve => setTimeout(resolve, 1))
          db.put('key3', 'test-async-child-txn');
        })
        should.equal(db.get('key3'), 'test-async-child-txn');
      })
    });
    it('async transaction with interrupting sync transaction default order', async function() {
      for (let i =0; i< 10;i++) {
        db.strictAsyncOrder = true
        let order = []
        let ranSyncTxn
        db.transactionAsync(() => {
          order.push('a1');
          db.put('async1', 'test');
          if (!ranSyncTxn) {
            ranSyncTxn = true;
            setImmediate(() => {
              db.transactionSync(() => {
                order.push('s1');
                db.put('inside-sync', 'test');
              });
            });
          }
        });
        db.put('outside-txn', 'test');
        await db.transactionAsync(() => {
          order.push('a2');
          db.put('async2', 'test');
        });
        order.should.deep.equal(['a1', 's1', 'a2']);
        should.equal(db.get('async1'), 'test');
        should.equal(db.get('outside-txn'), 'test');
        should.equal(db.get('inside-sync'), 'test');
        should.equal(db.get('async2'), 'test');
      }
    });
    it('multiple async mixed', async function() {
      let result
      for (let i = 0; i < 100; i++) {
        if (i%4 < 3) {
          if (i%8 == 1) {
            let sync = () => db.transactionSync(() => {
              db.put('foo' + i, i)
            })
            if (i%16 == 1)
              setImmediate(sync)
            else
              sync()
            continue
          }
          db.strictAsyncOrder = i%4 == 2
          result = db.transaction(() => {
            db.put('foo' + i, i)
          })
        } else {
          result = db.put('foo' + i, i)
        }
      }
      await result
      for (let i = 0; i < 100; i++) {
        should.equal(db.get('foo' + i), i)
      }
    })
    it('big child transactions', async function() {
      let ranTransaction
      db.put('key1',  'async initial value'); // should be queued for async write, but should put before queued transaction
      let errorHandled
      if (!db.cache) {
        db.childTransaction(() => {
          let value
          for (let i = 0; i < 5000; i++) {
            db.put('key' + i, 'test')
          }
        })
        await db.put('key1',  'test');
        should.equal(db.get('key1'), 'test');
      }
    });
    it('handle write transaction with hanging cursors', async function() {
      db.put('c1', 'value1');
      db.put('c2', 'value2');
      db.put('c3', 'value3');
      await db;
      let iterator
      db.transactionSync(() => {
        if (db.cache) {
          iterator = db.getRange({ start: 'c1' })[Symbol.iterator]();
          should.equal(iterator.next().value.value, 'value1');
        } else {
          db.childTransaction(() => {
            iterator = db.getRange({ start: 'c1' })[Symbol.iterator]();
            console.log('a');
            should.equal(iterator.next().value.value, 'value1');
            console.log('b');
          });
        }
        console.log('c');
        should.equal(iterator.next().value.value, 'value2');
        console.log('d');
      });
      console.log('e');
      should.equal(iterator.next().value.value, 'value3');
      console.log('f');
    });
    it('mixed batches', async function() {
      let promise
      for (let i = 0; i < 20; i++) {
        db.put(i, 'test')
        promise = db.batch(() => {
          for (let j = 0; j < 20; j++) {
            db.put('test:' + i + '/' + j, i + j)
          }
        })
      }
      await promise
      for (let i = 0; i < 20; i++) {
        should.equal(db.get(i), 'test');
        for (let j = 0; j < 20; j++) {
          should.equal(db.get('test:' + i + '/' + j), i + j)
        }
      }
    });
    it('levelup style callback', function(done) {
      should.equal(db.isOperational(), true)
      should.equal(db.status, 'open')
      should.equal(db.supports.permanence, true)
      db.put('key1', '1', (error, result) => {
        should.equal(error, null)
        '1'.should.equal(db.get('key1'))
        db.del('key1', (error, result) => {
          should.equal(error, null)
          let leveldb = levelup(db)
          leveldb.get('key1', (error, value) => {
            should.equal(error.name, 'NotFoundError')
            leveldb.put('key1', 'test', (error, value) => {
              leveldb.getMany(['key1'], (error, values) => {
                should.equal('test', values[0])
                done();
              })
            })
          })
          
        })
      })
    });
    it('batch operations', async function() {
      let batch = db.batch()
      batch.put('test:z', 'z')
      batch.clear()
      batch.put('test:a', 'a')
      batch.put('test:b', 'b')
      batch.put('test:c', 'c')
      batch.del('test:c')
      let callbacked
      await batch.write(() => { callbacked = true })
      should.equal(callbacked, true)
      should.equal(db.get('test:a'), 'a')
      should.equal(db.get('test:b'), 'b')
      should.equal(db.get('test:c'), undefined)
      should.equal(db.get('test:d'), undefined)
    });
    it('batch array', async function() {
      await db.batch([
        {type: 'put', key: 'test:a', value: 1 },
        {type: 'put', key: 'test:b', value: 2 },
        {type: 'put', key: 'test:c', value: 3 },
        {type: 'del', key: 'test:c' },
      ])
      should.equal(db.get('test:a'), 1)
      should.equal(db.get('test:b'), 2)
      should.equal(db.get('test:c'), undefined)
    });
    it('read and write with binary encoding', async function() {
      let dbBinary = db.openDB(Object.assign({
        name: 'mydb5',
        encoding: 'binary'
      }));
      dbBinary.put('buffer', Buffer.from('hello'));
      dbBinary.put('empty', Buffer.from([]));
      let promise = dbBinary.put('Uint8Array', new Uint8Array([1,2,3]));
      await promise
      await promise.flushed
      dbBinary.get('buffer').toString().should.equal('hello');
      dbBinary.get('Uint8Array')[1].should.equal(2);
      dbBinary.get('empty').length.should.equal(0);
    });
    it('read and write with binary encoding of key and value', async function() {
      let dbBinary = db.openDB({
        name: 'mydb-binary',
        encoding: 'binary',
        keyEncoding: 'binary'
      });
      
      let k = Buffer.from("key");
      let v = Buffer.from("value");
      
      await dbBinary.put(k, v);
      let count = 0;
      for (let { key, value } of dbBinary.getRange({})) {
        should.equal(key.constructor, Buffer);
        should.equal(key.length, 3);
        should.equal(value.constructor, Buffer);
        should.equal(value.length, 5);
        count++;
      }
      should.equal(count, 1);
    });
    it.skip('read and write with binary methods', async function() {
      let dbBinary = db.openDB(Object.assign({
        name: 'mydb6',
        keyEncoding: 'uint32',
        create: true,
      }));
      dbBinary.put(3, Buffer.from('hello'));
      await dbBinary.put(4, new Uint8Array([1,2,3]));
      console.log(dbBinary.getBinaryLocation(3))
      console.log(dbBinary.getBinaryLocation(4))
    });
    after(function(done) {
      db.get('key1');
      let iterator = db.getRange({})[Symbol.iterator]()
      setTimeout(() => {
        db.get('key1');
        // should have open read and cursor transactions
        db2.close();
        db.close();
        if (options.encryptionKey) {
          return done();
        }
        unlinkSync(testDirPath + '/test-' + testIteration + '.mdb');
        console.log('successfully unlinked')
        done();
      },10);
    });
  }}
  describe('direct key', function() {
    it('should serialize and deserialize keys', function() {
      let keys = [
        Symbol.for('test'),
        false,
        true,
        -33,
        -1.1,
        3.3,
        5,
        [5,4],
        [5,55],
        'hello',
        ['hello', 3],
        ['hello', 'world'],
        [ 'uid', 'I-7l9ySkD-wAOULIjOEnb', 'Rwsu6gqOw8cqdCZG5_YNF' ],
        'x'.repeat(1978),
        'z'
      ]
      let serializedKeys = []
      for (let key of keys) {
        let buffer = keyValueToBuffer(key)
        serializedKeys.push(bufferToKeyValue(buffer))
      }
      serializedKeys.should.deep.equal(keys)
    })
  });
  describe('uint32 keys', function() {
    this.timeout(10000);
    let db, db2;
    before(function() {
      db = open(testDirPath, {
        name: 'uint32',
        keyEncoding: 'uint32',
        compression: true,
      });
    });
    it('write and read range', async function() {
      let lastPromise
      for (let i = 0; i < 10; i++) {
        lastPromise = db.put(i, 'value' + i);
      }
      await lastPromise
      let i = 0
      for (let { key, value } of db.getRange()) {
        key.should.equal(i);
        value.should.equal('value' + i);
        i++;
      }
      i = 0
      for (let { key, value } of db.getRange({ start: 0 })) {
        key.should.equal(i);
        value.should.equal('value' + i);
        i++;
      }
    });
    after(function() {
      console.log('closing')
      db.close();
      console.log('closed')
    });
  });
  describe('RangeIterable', function() {
    it('concat and iterate', async function() {
      let a = new RangeIterable([1, 2, 3])
      let b = new RangeIterable([4, 5, 6])
      let all = []
      for (let v of a.concat(b)) {
        all.push(v)
      }
      all.should.deep.equal([1, 2, 3, 4, 5, 6])
    });
  });
  describe('mixed keys', function() {
    this.timeout(10000);
    let intKeys, strKeys;
    before(function() {
      const rootDb = open({
        name: `root`,
        path: testDirPath + '/test-mixedkeys.mdb',
        keyEncoding: 'ordered-binary',
      })

      intKeys = rootDb.openDB({
        name: `intKeys`,
        keyEncoding: 'uint32',
      })

      strKeys = rootDb.openDB({
        name: `strKeys`,
        keyEncoding: 'ordered-binary',
      })

    })
    it('create with keys', async function() {
      let lastPromise
      for (let intKey = 0; intKey < 100; intKey++) {
        const strKey = `k${intKey}`
        intKeys.put(intKey, `${intKey}-value`)
        lastPromise = strKeys.put(strKey, `${strKey}-value`)
      }
      await lastPromise
    });
  });
  describe('Threads', function() {
    this.timeout(10000);
    it('will run a group of threads with read-only transactions', function(done) {
      var child = spawn('node', [fileURLToPath(new URL('./threads.cjs', import.meta.url))]);
      child.stdout.on('data', function(data) {
        console.log(data.toString());
      });
      child.stderr.on('data', function(data) {
        console.error(data.toString());
      });
      child.on('close', function(code) {
        code.should.equal(0);
        done();
      });
    });
  });
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

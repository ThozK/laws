import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validWeights,toggleColumnWidth} from '../src/layout.js';
test('色付きバーは拡大、元に戻す、拡大列切替の3動作を行う',()=>{let w=toggleColumnWidth([1,1,1],0);assert.deepEqual(w,[2,1,1]);w=toggleColumnWidth(w,1);assert.deepEqual(w,[1,2,1]);w=toggleColumnWidth(w,1);assert.deepEqual(w,[1,1,1]);});
test('2倍を超える保存比率や複数列拡大は採用しない',()=>{assert.equal(validWeights([3,1,1]),false);assert.equal(validWeights([2,2,1]),false);assert.equal(validWeights([1,1,2]),true);});

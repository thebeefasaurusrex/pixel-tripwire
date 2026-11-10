import test from 'node:test';
import assert from 'node:assert/strict';
import { score } from '../bin/score.mjs';

test('Pixel Tripwire scorer distinguishes a perfect answerer from planted bad ones and is deterministic', () => {
  const frames=['battle','muster','rebuild'].map((phase,i)=>({frame_id:String(i),look:'old',phase,size:[100,100],cannons:[{id:'a',bbox:[10,10,15,15]}],...(i===0?{planted:{type:'magenta'}}:{})}));
  const answers=frames.flatMap((f,i)=>[['J1',{phase:f.phase},{phase:'battle'}],['J2',{broken:i===0},{broken:true}],['J3',{cannons:[{x:.125,y:.125}]},{cannons:[{x:.5,y:.5}]}]].flatMap(([job,good,bad])=>[['perfect',good],['bad',bad]].map(([answerer,value])=>({answerer,job,value,frame:f.frame_id,key:f.frame_id,variant:'base',seconds:1}))));
  const a=score(frames,answers);
  assert.equal(a['perfect J1'].accuracy.rate,1);
  assert.equal(a['perfect J2'].catch.magenta.rate,1);
  assert.equal(a['perfect J2'].false_alarms.rate,0);
  assert.equal(a['perfect J3'].recall.rate,1);
  assert.equal(a['perfect J3'].precision.rate,1);
  assert.equal(a['bad J1'].accuracy.rate,1/3);
  assert.equal(a['bad J2'].catch.magenta.rate,1);
  assert.equal(a['bad J2'].false_alarms.rate,1);
  assert.equal(a['bad J3'].recall.rate,0);
  assert.equal(JSON.stringify(a),JSON.stringify(score(frames,[...answers].reverse())));
});

test('a truncated J3 reply counts as attempted and misses every visible cannon', () => {
  const frames=['valid','truncated'].map(frame_id=>({frame_id,look:'new',phase:'battle',size:[100,100],cannons:[{id:'a',bbox:[10,10,15,15]}]}));
  const attempt=(frame,result)=>({frame,key:frame,answerer:'vision',job:'J3',variant:'base',seconds:1,...result});
  const failed=attempt('truncated',{error:'Unterminated string'});
  const [valid]=frames;
  const s=score(frames,[attempt(valid.frame_id,{value:{cannons:[{x:.125,y:.125}]}}),failed])['vision J3'];
  assert.deepEqual([s.answered,s.attempted,s.recall.hits,s.recall.n,s.recall.rate],[1,2,1,2,.5]);
  assert.equal(score(frames,[failed])['vision J3'].recall.rate,0);
});

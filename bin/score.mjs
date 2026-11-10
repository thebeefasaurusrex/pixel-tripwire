import { wilson } from '../lib/stats.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { fileURLToPath } from 'node:url';

const ratio = (hits, n) => ({ hits, n, rate: n ? hits / n : null, interval: wilson(hits, n) });
export function match(points, boxes, size) {
  const owners = new Map();
  function assign(i, seen) {
    const p = points[i];
    for (const [j, {bbox:[l,t,r,b]}] of boxes.entries()) {
      if (seen.has(j) || p.x * size[0] < l-(r-l)*.15 || p.x * size[0] > r+(r-l)*.15 ||
          p.y * size[1] < t-(b-t)*.15 || p.y * size[1] > b+(b-t)*.15) continue;
      seen.add(j);
      if (!owners.has(j) || assign(owners.get(j), seen)) { owners.set(j, i); return true; }
    }
    return false;
  }
  points.forEach((_,i) => assign(i, new Set()));
  return owners;
}
const tally = (map, k, hit) => { const [a,b] = map[k] ?? [0,0]; map[k] = [a+Number(hit), b+1]; };
const ratios = (map) => Object.fromEntries(Object.entries(map).sort().map(([k,v]) => [k,ratio(...v)]));
const quantile = (vals, p) => vals.length ? [...vals].sort((a,b)=>a-b)[Math.ceil(p*vals.length)-1] : null;

export function score(frames, answers) {
  const labels = new Map(frames.map(f => [f.frame_id, f]));
  const out = {};
  const visibility = new Map(answers.filter(a=>a.answerer==='ruler' && a.job==='J3').map(a=>[a.frame,a.value]));
  for (const key of [...new Set(answers.map(a=>a.answerer+' '+a.job))].sort()) {
    const [answerer,job] = key.split(' ');
    const attempts = answers.filter(a => a.answerer===answerer && a.job===job && labels.has(a.frame))
      .sort((a,b)=>a.frame.localeCompare(b.frame)||a.key.localeCompare(b.key));
    const rows = attempts.filter(a=>!a.error);
    const regular = rows.filter(a=>a.variant==='base');
    const base = new Map(regular.filter(a=>a.variant==='base').map(a=>[a.frame, a.value]));
    const stability = rows.filter(a=>a.variant==='repeat' && base.has(a.frame));
    const s = out[key] = {answered:regular.length, errors:answers.filter(a=>a.answerer===answerer&&a.job===job&&a.error).length,
      median_seconds:quantile(regular.map(a=>a.seconds),.5), p95_seconds:quantile(regular.map(a=>a.seconds),.95),
      peak_vram_mib: Math.max(0,...regular.map(a=>a.vram??0)),
      stability:ratio(stability.filter(a=>JSON.stringify(a.value)===JSON.stringify(base.get(a.frame))).length,stability.length)};
    if (job==='J1') {
      const phases={}, confusion={};
      for (const a of regular) {
        const phase=labels.get(a.frame).phase;
        tally(phases,phase,a.value.phase===phase);
        confusion[phase] ??= {};
        confusion[phase][a.value.phase]=(confusion[phase][a.value.phase]??0)+1;
      }
      const few=rows.filter(a=>a.variant==='few');
      s.few_shot_accuracy=ratio(few.filter(a=>a.value.phase===labels.get(a.frame).phase).length,few.length);
      Object.assign(s,{accuracy:ratio(regular.filter(a=>a.value.phase===labels.get(a.frame).phase).length,regular.length), phases:ratios(phases),confusion});
    } else if (job==='J2') {
      const fault={}, normal=[];
      for (const a of regular) {
        const type=labels.get(a.frame).planted?.type;
        if (type) tally(fault,type,a.value.broken);
        else normal.push(a);
      }
      const priority=[...regular].sort((a,b)=>(b.value.suspicion??Number(b.value.broken))-(a.value.suspicion??Number(a.value.broken)));
      const top=priority.slice(0,Math.ceil(priority.length*.02));
      Object.assign(s,{catch:ratios(fault),false_alarms:ratio(normal.filter(a=>a.value.broken).length,normal.length),
        top_2_percent:ratio(top.filter(a=>labels.get(a.frame).planted).length,regular.length-normal.length)});
    } else if (job==='J3' && answerer!=='ruler') {
      const attempted = attempts.filter(a=>a.variant==='base');
      let hits=0, truth=0, points=0, countError=0;
      const slices={};
      for (const a of attempted) {
        const f=labels.get(a.frame);
        const p=a.error?[]:a.value.cannons.filter(q=>Number.isFinite(q.x)&&Number.isFinite(q.y));
        const boxes=f.planted?.type==='black'?[]:f.cannons.filter(b=>!b.occluded);
        const found=match(p,boxes,f.size);
        hits+=found.size; truth+=boxes.length; points+=p.length; countError+=Math.abs(p.length-boxes.length);
        if (f.planted) continue;
        for (const [i,b] of boxes.entries()) {
          const v=visibility.get(f.frame_id)?.find(c=>c.id===b.id);
          const short=v?.shortest ?? Math.min(b.bbox[2]-b.bbox[0],b.bbox[3]-b.bbox[1]);
          const contrast=v?.deltaE;
          for (const k of [f.look,f.phase, short<12?'size <12':short<24?'size 12–23':'size 24+',
            contrast==null?'contrast unavailable':contrast<8?'contrast <8':contrast<20?'contrast 8–19':'contrast 20+']) tally(slices,k,!found.has(i));
        }
      }
      Object.assign(s,{attempted:attempted.length,recall:ratio(hits,truth),precision:ratio(hits,points),mean_count_error:attempted.length?countError/attempted.length:null,miss_rate:ratios(slices)});
    }
  }
  return out;
}
function jsonl(path) {
  return readFileSync(path,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [labels, answers, output] = process.argv.slice(2);
  if (!labels || !answers || !output || process.argv.length !== 5) {
    console.error('Usage: node bin/score.mjs <labels.jsonl> <answers.jsonl> <output-directory>');
    process.exit(2);
  }
  const scores=score(jsonl(labels),jsonl(answers));
  mkdirSync(output,{recursive:true});
  writeFileSync(join(output,'scores.json'),JSON.stringify(scores,null,2)+'\n');
  const fmt=({rate,interval})=>rate==null?'no samples':`${(rate*100).toFixed(1)}% [${(interval[0]*100).toFixed(1)}, ${(interval[1]*100).toFixed(1)}]`;
  const lines=['# Pixel Tripwire scorecard','','Rates include Wilson 95% intervals.'];
  for(const [key,s] of Object.entries(scores)) {
    const result=s.accuracy?`accuracy ${fmt(s.accuracy)}`:s.recall?`recall ${fmt(s.recall)}; precision ${fmt(s.precision)}`:s.false_alarms?`false alarms ${fmt(s.false_alarms)}; faults in top 2% ${fmt(s.top_2_percent)}`:'visibility measurements';
    lines.push(`- ${key}: ${result}${s.attempted==null?'':`; ${s.answered}/${s.attempted} valid/attempted`}`);
  }
  writeFileSync(join(output,'SCORECARD.md'),lines.slice(0,40).join('\n')+'\n');
  writeFileSync(join(output,'digest.txt'),lines.filter(Boolean).slice(0,15).join('\n')+'\n');
}

import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3022';
const get=async path=>{const r=await fetch(base+path);assert.equal(r.status,200);return r.json();};
assert.equal((await get('/api/health')).instance,createHash('sha256').update(resolve('.').toLowerCase()).digest('hex').slice(0,16));
assert.equal((await get('/api/ai-settings')).configured,false);
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function waitFor(predicate,label){for(let i=0;i<90;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,1000));}throw new Error(`Timeout: ${label}`);}
try {
  await page.goto(`${base}/#view=knowledge`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'新建笔记',exact:true}).first().click();
  const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'整理成一条知识笔记'})});
  await dialog.locator('input').first().fill('草稿恢复验证');
  await dialog.locator('textarea').first().fill('尚未保存成笔记的正文，刷新后应能继续。');
  await waitFor(async()=>(await get('/api/workspace')).state.noteDraft?.note?.title==='草稿恢复验证','draft persisted');
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await dialog.locator('input').first().inputValue(),'草稿恢复验证');
  assert.match(await dialog.locator('textarea').first().inputValue(),/刷新后应能继续/);
  const bundle=await get('/api/backup');assert.equal(bundle.state.noteDraft.note.title,'草稿恢复验证');
  await dialog.getByRole('button',{name:'保存笔记',exact:true}).click();
  await waitFor(async()=>(await get('/api/workspace')).state.noteDraft?.note===null,'draft consumed');
  await page.goto(`${base}/#view=materials&course=demo-linear`);
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1200;c.height=500;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1200,500);x.fillStyle='black';x.font='48px Arial';x.fillText('MATRIX MULTIPLICATION',40,100);x.fillText('AB and BA are different.',40,190);x.fillText('Velocity = 2 meters per second.',40,280);return c.toDataURL('image/png').split(',')[1];});
  await page.locator('input[type=file][accept*=".pdf"]').setInputFiles({name:'自编识别测试.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.getByRole('button',{name:'识别扫描文字',exact:true}).click();
  await waitFor(async()=>{const s=(await get('/api/workspace')).state;return s.courses[0].materials.some(m=>m.name==='自编识别测试.png'&&m.passages?.some(p=>/MATRIX/i.test(p.text)));},'real OCR');
  await page.getByRole('button',{name:'校正提取文字',exact:true}).click();
  const correction=page.locator('.material-correction');
  await correction.locator('textarea').first().fill('矩阵乘法一般不可交换，AB 不等于 BA。人工校正回归。');
  await correction.getByRole('button',{name:'确认校正并更新检索'}).click();
  await waitFor(async()=>(await get('/api/workspace')).state.courses[0].materials.some(m=>m.name==='自编识别测试.png'&&m.status==='已人工校正'),'correction persisted');
  await page.screenshot({path:'work/ui/ocr-corrected.png',fullPage:true});
  const snapshots=(await get('/api/snapshots')).snapshots;assert.ok(snapshots.length);
  const snapshot=await get(`/api/backup?snapshot=${snapshots[0].id}`);assert.equal(snapshot.format,'course-kb-bundle');
  const state=(await get('/api/workspace')).state;
  const sourceId=state.courses[0].materials.find(m=>m.fileId).fileId;
  const remove=await fetch(`${base}/api/files?id=${sourceId}`,{method:'DELETE'});assert.equal(remove.status,409);
  assert.deepEqual(errors,[]);
  const report={verifiedAt:new Date().toISOString(),draftReload:true,draftInFullBackup:true,draftConsumedOnSave:true,realLocalOCR:true,manualCorrection:true,snapshotExport:true,referencedAttachmentDeletionBlocked:true,pageErrors:errors,limits:'同一台 Windows 电脑的无头 Edge；OCR 使用自编清晰英文图片，不代表复杂中文公式识别质量。'};
  await writeFile('docs/evaluation/protection-ui.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(e){await page.screenshot({path:'work/ui/protection-failure.png',fullPage:true});await writeFile('work/ui/protection-failure.txt',await page.locator('body').innerText());throw e;}
finally{await browser.close();}

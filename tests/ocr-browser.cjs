// Run with Playwright available via NODE_PATH. Uses an isolated browser profile.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let acceptDialogs=true;
 page.on('dialog',d=>acceptDialogs?d.accept():d.dismiss());
 await page.goto('http://127.0.0.1:8000');
 await page.locator('#show-courses').click();await page.getByRole('button',{name:'从截图导入课程表',exact:true}).click();
 const dialog=page.locator('.import-dialog');
 await dialog.getByText('原始 OCR 文本（可修改）',{exact:true}).click();
 await dialog.getByLabel('原始 OCR 文本，可修改后重新解析').fill('软件开发 周三 第5节、第6节\n地点：理教203\n教师：王老师\n1-16周 单周');
 await dialog.getByRole('button',{name:'按文本重新解析'}).click();
 assert.equal(await page.evaluate(()=>localStorage.getItem('rixu.courses.v1')),null);
 await dialog.getByRole('button',{name:'确认导入已选课程'}).click();assert.match(await dialog.locator('.import-message').innerText(),/补全/);
 await dialog.getByText('节次 → 时间映射',{exact:true}).click();
 await dialog.getByLabel('节次时间映射，每行如 1=08:00-08:50').fill('5=13:00-13:50\n6=14:00-14:50');
 await dialog.getByRole('button',{name:'保存映射并补全'}).click();
 assert.equal(await dialog.getByLabel('开始时间',{exact:true}).inputValue(),'13:00');
 await dialog.getByLabel('课程名称',{exact:true}).fill('软件开发校对');
 await dialog.getByRole('button',{name:'确认导入已选课程'}).click();
 let courses=await page.evaluate(()=>JSON.parse(localStorage.getItem('rixu.courses.v1')));assert.equal(courses.length,1);assert.equal(courses[0].name,'软件开发校对');assert.equal(courses[0].teacher,'王老师');assert.equal(courses[0].end,'14:50');
 await dialog.getByRole('button',{name:'手动新增候选课程'}).click();await dialog.getByRole('button',{name:'删除此候选'}).click();assert.equal(await dialog.locator('.import-candidate').count(),0);
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();await page.reload();await page.locator('#show-courses').click();await page.locator('#course-tab-all').click();await page.locator('#course-all').getByRole('button').first().click();assert.match(await page.locator('#course-detail').innerText(),/软件开发校对/);
 await page.getByRole('button',{name:'从截图导入课程表',exact:true}).click();assert.match(await dialog.getByLabel('节次时间映射，每行如 1=08:00-08:50').inputValue(),/5=13:00/);
 for(const width of [1280,390,320]){await page.setViewportSize({width,height:850});await dialog.getByRole('button',{name:'手动新增候选课程'}).click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.screenshot({path:path.join(require('os').tmpdir(),`todo-ocr-${width}.png`),fullPage:true});await dialog.getByRole('button',{name:'删除此候选'}).click();}
 // Real OCR from a generated, high-contrast Chinese screenshot.
 const fixture=await browser.newPage({viewport:{width:1200,height:500}});
 await fixture.setContent('<html lang="zh-CN"><body style="font:36px Microsoft YaHei;background:white;color:black;padding:35px"><p>课程名称：软件开发</p><p>周三 13:00-17:00</p><p>地点：理教203</p><p>教师：王老师</p></body></html>');
 const png=await fixture.screenshot();await fixture.close();
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();await page.setViewportSize({width:1280,height:900});await page.getByRole('button',{name:'从截图导入课程表',exact:true}).click();
 await dialog.getByLabel('上传课程表截图').setInputFiles({name:'timetable.png',mimeType:'image/png',buffer:png});
 await dialog.getByRole('button',{name:'开始 / 重新识别'}).click();
 await page.waitForFunction(()=>document.querySelector('.import-dialog [role=status]').textContent.includes('识别完成')||document.querySelector('.import-dialog [role=status]').textContent.includes('识别未完成'),{},{timeout:210000});
 const status=await dialog.locator('[role=status]').innerText();const msg=await dialog.locator('.import-message').innerText();console.log('OCR:',status,msg);
 assert.match(status,/识别完成/);const raw=await dialog.getByLabel('原始 OCR 文本，可修改后重新解析').inputValue();console.log('OCR text:',raw);assert.match(raw,/13:00/);assert.equal(await dialog.locator('.import-candidate').count(),1);
 assert.equal(await dialog.getByLabel('课程名称',{exact:true}).inputValue(),'软件开发');
 await dialog.getByLabel('课程名称',{exact:true}).fill('软件开发校对');
 await dialog.getByLabel('结束时间',{exact:true}).fill('14:50');
 acceptDialogs=false;await dialog.getByRole('button',{name:'确认导入已选课程'}).click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('rixu.courses.v1')).length),1);
 acceptDialogs=true;
 await dialog.getByLabel('课程名称',{exact:true}).fill('存储失败测试');
 await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('quota');};});
 await dialog.getByRole('button',{name:'确认导入已选课程'}).click();assert.match(await dialog.locator('.import-message').innerText(),/保存失败/);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('rixu.courses.v1')).length),1);
 await page.evaluate(()=>Storage.prototype.setItem=window.originalSetItem);
 await dialog.getByRole('checkbox').uncheck();await dialog.getByRole('button',{name:'确认导入已选课程'}).click();assert.match(await dialog.locator('.import-message').innerText(),/至少/);
 await page.evaluate(()=>{window.Tesseract={createWorker:async()=>{throw Error('模拟网络失败');}};});
 await dialog.getByRole('button',{name:'开始 / 重新识别'}).click();await page.waitForFunction(()=>document.querySelector('.import-message').textContent.includes('模拟网络失败'));
 assert.equal(await dialog.locator('.import-candidate').count(),1);
 await dialog.getByRole('button',{name:'手动新增候选课程'}).click();assert.equal(await dialog.locator('.import-candidate').count(),2);
 assert.deepEqual(errors,[]);console.log('PASS: real browser import validation, mapping, edits, manual CRUD, course detail integration, reload, desktop/390/320 layout, real Chinese OCR, no page errors.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});


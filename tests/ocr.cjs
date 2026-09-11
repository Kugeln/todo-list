const assert=require('node:assert/strict');
const p=require('../course-import.js');
let c=p.parse('算法 周二 13:00-17:00\n地点：理教 203\n教师：张老师\n1-16周 单周')[0];
assert.equal(c.name,'算法');assert.equal(c.day,2);assert.equal(c.start,'13:00');assert.equal(c.end,'17:00');assert.equal(c.repeat,'odd');assert.equal(c.location,'理教 203');assert.equal(c.teacher,'张老师');assert.match(c.notes,/1-16周/);
c=p.parse('数学 周三 第5节、第6节')[0];assert.equal(c.start,'');assert.equal(c.periods,'5,6');
const map={5:{start:'13:00',end:'13:50'},6:{start:'14:00',end:'14:50'}};
assert.equal(p.applyMapping(c,map).end,'14:50');assert.equal(p.applyMapping(c,{5:map[5]}).start,'');
assert.equal(p.applyMapping({...c,start:'12:00',end:'16:00'},map).start,'12:00');
assert.equal(p.parse('无法辨认的课程')[0].day,0);assert.equal(p.parse('无法辨认的课程')[0].name,'无法辨认的课程');assert.equal(p.parse('').length,0);
assert.equal(p.parse('数学 周一 08:00-09:00\n英语 周二 10:00-11:00').length,2);
assert.equal(p.duplicate({name:' 数 学 ',day:1,start:'08:00',end:'09:00'},{name:'数学',day:1,start:'08:00',end:'09:00'}),true);
function line(text,x,y,w=80){return {text,bbox:{x0:x,y0:y,x1:x+w,y1:y+20}};}
const lines=[line('周一',200,10),line('周二',400,10),line('周三',600,10),line('第5-6节',0,120),line('数学',200,120),line('13:00-17:00',200,145),line('地点：理教',200,170),line('英语',400,120)];
const parsed=p.parse('',lines);assert.equal(parsed.length,2);assert.equal(parsed[0].day,1);assert.equal(parsed[0].start,'13:00');assert.equal(parsed[1].periods,'5,6');assert.equal(parsed[1].start,'');
console.log('PASS: OCR explicit times, periods without guessed times, mappings, missing fields, repeat/week preservation, layout coordinates, duplicates.');
const spaced=p.parse('课程 名 称 : 软件 开发\n周三 13:00-17:00\n地 点 : 理 教 203\n教师 : 王 老 师');
assert.equal(spaced.length,1);assert.equal(spaced[0].name,'软件开发');assert.equal(spaced[0].location,'理教 203');

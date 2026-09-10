// Dependency-free regression checks. Browser rendering is checked separately.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
class Element {
  constructor() { this.children = []; this.value = ''; this.handlers = {}; this.attributes = {}; this.dataset = {}; }
  querySelector(selector) { const date = selector.match(/data-date="([^"]+)"/)?.[1]; return this.children.find(child => child.dataset?.date === date) || this.children.map(child => child.querySelector?.(selector)).find(Boolean); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; this.value = nodes[0]?.value || ''; }
  add(node) { this.append(node); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, handler) { this.handlers[key] = handler; }
  querySelectorAll() { return this.children; }
  focus() {}
  scrollIntoView() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
}
const storage = new Map();
let fail = false;
function boot() {
  const nodes = {};
  const get = selector => nodes[selector] ||= new Element();
  function makeForm(id, defaults) {
    const form = get(id);
    form.elements = Object.fromEntries(Object.keys(defaults).map(key => [key, new Element()]));
    form.reset = () => Object.entries(defaults).forEach(([key, value]) => { form.elements[key].value = value; });
    form.reset(); return form;
  }
  const form = makeForm('#task-form', { title: '', tags: '', date: '', deadline: '', repeat: 'none', status: 'todo', repeatInterval: '1', repeatUnit: 'days' });
  const course = makeForm('#course-form', { name: '', teacher: '', description: '', day: '1', repeat: 'every', start: '', end: '', location: '', notes: '' });
  const food = makeForm('#food-form', { name: '', date: '', type: '奶茶', level: '2', kcal: '', notes: '' });
  get('#center-form').elements = {};
  get('#center-form').reset = () => {};
  get('#center-fields').append = (...items) => { for (const item of items) { get('#center-fields').children.push(item); if(item.id) nodes['#'+item.id]=item; if(item.name) get('#center-form').elements[item.name]=item; } };
  const context = vm.createContext({ URL, document: { querySelector: get, createElement: () => new Element() }, Option: function(text, value) { this.textContent = text; this.value = value; }, FormData: function(form) { this.get = key => form.elements[key].disabled ? null : form.elements[key].value; }, crypto: require('node:crypto').webcrypto, structuredClone, confirm: () => true, console, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { if (fail) throw Error('storage blocked'); storage.set(key, value); } } });
  for (const file of ['app.js', 'course-center.js', 'courses.js', 'food.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  const run = code => vm.runInContext(code, context);
  const submit = (target, values) => { for (const [key, value] of Object.entries(values)) target.elements[key].value = value; if (target === form) run('syncRepeatFields()'); target.handlers.submit({ preventDefault() {} }); };
  const click = selector => get(selector).handlers.click();
  return { get, form, course, food, run, submit, click };
}
// An actual v1-shaped record must survive loading and editing without losing its monthly anchor.
storage.set('rixu.tasks.v1', JSON.stringify([{ id: 'legacy', title: '旧版任务', tags: ['课程'], date: '2026-02-28', deadline: '2026-02-28T18:30', repeat: 'monthly', status: 'todo', anchorDay: 31 }]));
let app = boot();
app.run('startEdit(tasks[0])'); app.submit(app.form, { title: '旧任务已编辑' });
assert.equal(app.run('tasks[0].anchorDay'), 31);
app.run('tasks[0].status="done";completeRecurrence(tasks[0],tasks);persist(tasks);render()');
assert.equal(app.run('tasks[0].date'), '2026-03-31');
assert.equal(app.run('tasks[0].deadline'), '2026-03-31T18:30');
app.run('completeRecurrence(tasks[1],tasks)'); assert.equal(app.run('tasks.length'), 2);
const cases = [
  ['2024-02-28', 'daily', 28, 1, 'days', '2024-02-29'],
  ['2026-12-28', 'weekly', 28, 1, 'weeks', '2027-01-04'],
  ['2026-01-31', 'monthly', 31, 1, 'months', '2026-02-28'],
  ['2026-12-30', 'custom', 30, 3, 'days', '2027-01-02'],
  ['2026-09-09', 'custom', 9, 2, 'weeks', '2026-09-23'],
  ['2026-12-31', 'custom', 31, 2, 'months', '2027-02-28'],
  ['2024-01-31', 'custom', 31, 1, 'months', '2024-02-29'],
];
for (const [date, repeat, day, interval, unit, expected] of cases) assert.equal(app.run(`nextDate(${JSON.stringify(date)},${JSON.stringify(repeat)},${day},${interval},${JSON.stringify(unit)})`), expected);
for (const interval of ['0', '-1', '1.5', '1000']) { app.submit(app.form, { title: '无效间隔', repeat: 'custom', repeatInterval: interval }); assert.equal(app.run('tasks.length'), 2); }
app.submit(app.form, { title: '自定义任务', tags: '学习，课程,学习', repeat: 'custom', repeatInterval: '3', repeatUnit: 'days', date: '2026-09-09', deadline: '2026-09-09T09:15' });
assert.equal(app.run('tasks.length'), 3); assert.equal(app.run('tasks[0].tags.length'), 2);
let select = app.get('#tasks').children[0].children[0].children[1];
select.value = 'doing'; select.handlers.change(); assert.equal(app.run('tasks[0].status'), 'doing');
select = app.get('#tasks').children[0].children[0].children[1]; select.value = 'done'; select.handlers.change();
assert.equal(app.run('tasks[0].date'), '2026-09-12'); assert.equal(app.run('tasks[0].title'), '自定义任务');
app.get('#hide-completed').checked = true; app.get('#hide-completed').handlers.change({ target: app.get('#hide-completed') });
app.run('statusFilter="done";render()'); assert.equal(app.get('#tasks').children.length, 0); assert.match(app.get('#empty h3').textContent, /已隐藏/);
app.run('statusFilter="all"'); app.get('#tag-filter').value = '学习'; app.run('render()'); assert.equal(app.get('#tasks').children.length, 1);
app = boot(); assert.equal(app.get('#hide-completed').checked, true); assert.equal(app.run('tasks.length'), 4); assert.equal(app.run('tasks[0].repeatInterval'), 3);
const before = app.run('tasks.length'); app.get('#tasks').children[0].children[2].children[1].children[1].handlers.click(); assert.equal(app.run('tasks.length'), before - 1);
app.click('#add-course'); app.submit(app.course, { name: '软件开发', day: '3', start: '10:00', end: '09:00' }); assert.equal(storage.has('rixu.courses.v1'), false);
app.submit(app.course, { end: '11:20', repeat: 'odd', location: '理教', notes: '带电脑' }); assert.equal(JSON.parse(storage.get('rixu.courses.v1')).length, 1);
const semester = app.get('#semester-start'); semester.value = app.run('localDate()');
// Use the currently displayed Monday, regardless of the day the tests run.
const date = new Date(); date.setDate(date.getDate() - (date.getDay() + 6) % 7); semester.value = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
semester.handlers.change({ target: semester }); assert.match(app.get('#course-summary').textContent, /本周显示 1 门/);
app.click('#next-week'); assert.match(app.get('#course-summary').textContent, /本周显示 0 门/); app.click('#prev-week');
let courseCard = app.get('#week-grid').children[2].children[1]; courseCard.children.at(-1).children[0].handlers.click();
app.submit(app.course, { name: '编辑课程', repeat: 'even' }); app.click('#next-week'); assert.match(app.get('#course-summary').textContent, /本周显示 1 门/);
app = boot(); app.click('#next-week'); assert.match(app.get('#course-summary').textContent, /本周显示 1 门/);
courseCard = app.get('#week-grid').children[2].children[1]; assert.equal(courseCard.children[1].textContent, '编辑课程'); courseCard.children.at(-1).children[1].handlers.click();
assert.equal(JSON.parse(storage.get('rixu.courses.v1')).length, 0);
fail = true; const count = app.run('tasks.length'); app.submit(app.form, { title: '保存失败' }); assert.equal(app.run('tasks.length'), count); assert.match(app.get('#message').textContent, /保存失败/); fail = false;
storage.set('rixu.tasks.v1', 'broken'); app = boot(); app.submit(app.form, { title: '不能覆盖' }); assert.equal(storage.get('rixu.tasks.v1'), 'broken');
console.log('PASS: legacy compatibility; task CRUD/status/tags; hide + filters + reload; normal/custom recurrence and boundaries; course CRUD/time validation/odd-even weeks/reload; failed storage and corrupt-data protection.');

storage.delete('rixu.tasks.v1'); app = boot();
const otherStorage = JSON.stringify([...storage]);
app.click('#show-food'); assert.equal(app.get('#food-module').hidden, false); assert.equal(app.get('#todo-module').hidden, true);
app.click('#add-food'); app.submit(app.food, { name: '奶茶', date: '2024-02-29', level: '3', kcal: '350.5', notes: '少糖' });
assert.equal(JSON.parse(storage.get('rixu.food.v1')).length, 1);
app.click('#add-food'); app.submit(app.food, { name: '甜点', date: '2024-02-29', type: '甜点', level: '2', kcal: '' });
const cell = () => { app.click("#food-view-year"); return app.get('#food-heatmap').querySelector('button[data-date="2024-02-29"]'); };
assert.match(cell().attributes['aria-label'], /2 条记录，等级累计 5 分/);
assert.match(app.get('#food-summary').textContent, /350.5 kcal（1\/2 条）/);
app.get('#food-records').children[0].children.at(-1).children[0].handlers.click();
app.submit(app.food, { name: '编辑奶茶', date: '2024-03-01', level: '1', kcal: '0' });
assert.match(cell().attributes['aria-label'], /1 条记录，等级累计 2 分/);
assert.match(app.get('#food-summary').textContent, /0 kcal/);
cell().handlers.click(); assert.equal(app.get('#food-records').children[0].children[0].textContent, '甜点');
app.get('#food-records').children[0].children.at(-1).children[1].handlers.click();
assert.match(cell().attributes['aria-label'], /0 条记录，等级累计 0 分/);
assert.equal(app.get('#food-empty').hidden, false);
app = boot(); const datePicker = app.get('#food-selected-date'); datePicker.value = '2024-03-01'; datePicker.handlers.change({target:datePicker});
assert.equal(app.get('#food-records').children[0].children[0].textContent, '编辑奶茶');
for (const value of [{date:'2023-02-29'}, {date:'2024-03-01',name:'   '}, {name:'测试',kcal:'-1'}, {kcal:'NaN'}, {kcal:'',level:'4'}]) {
  app.click('#add-food'); app.submit(app.food, {name:'测试',date:'2024-03-01',...value}); assert.equal(JSON.parse(storage.get('rixu.food.v1')).length,1);
}
fail = true; app.click('#add-food'); app.submit(app.food,{name:'不能保存',date:'2024-03-01'}); assert.equal(JSON.parse(storage.get('rixu.food.v1')).length,1); assert.match(app.get('#food-form-message').textContent,/保存失败/); fail=false;
assert.equal(JSON.stringify([...storage].filter(([key])=>key!=='rixu.food.v1')),otherStorage);
// View context, calendar boundaries, week crossing, and daily navigation.
function choose(value) { const picker=app.get('#food-selected-date'); picker.value=value; picker.handlers.change({target:picker}); }
choose('2024-01-31'); app.click('#food-view-month');
assert.equal(app.get('#food-heatmap').children.length,1);
app.click('#food-next-year'); assert.equal(app.get('#food-selected-date').value,'2024-02-29');
app.click('#food-view-year'); app.click('#food-next-year'); assert.equal(app.get('#food-selected-date').value,'2025-02-28');
choose('2026-12-31'); app.click('#food-view-week');
assert.equal(app.get('#food-heatmap').children.length,7);
assert.equal(app.get('#food-heatmap').children[0].dataset.date,'2026-12-28');
assert.equal(app.get('#food-heatmap').children[6].dataset.date,'2027-01-03');
app.click('#food-next-year'); assert.equal(app.get('#food-selected-date').value,'2027-01-07');
app.get('#food-heatmap').children[0].handlers.click();
assert.equal(app.get('#food-view-day').attributes['aria-pressed'],'true');
assert.equal(app.get('#food-day-details').hidden,false);
assert.equal(app.get('#food-selected-date').value,'2027-01-04');
app.click('#food-prev-year'); assert.equal(app.get('#food-selected-date').value,'2027-01-03');
app.click('#add-food'); assert.equal(app.food.elements.date.value,'2027-01-03');
choose('1900-01-01'); assert.equal(app.get('#food-prev-year').disabled,true);
console.log('PASS: four views, monthly/yearly clamp, cross-year Monday weeks, day selection and navigation, selected-date add default and lower date bound.');
storage.set('rixu.food.v1','corrupt'); app=boot(); app.click('#add-food'); app.submit(app.food,{name:'不能覆盖',date:'2024-03-01'}); assert.equal(storage.get('rixu.food.v1'),'corrupt');
app.click('#show-courses'); assert.equal(app.get('#food-module').hidden,true); assert.equal(app.get('#course-module').hidden,false);
console.log('PASS: food CRUD, leap dates, moved-date aggregation, zero/unknown kcal, calendar selection, reload, validation, storage failures, isolated storage and three-module navigation.');

// Course center entities, legacy course compatibility, assignment-to-task deduplication.
storage.delete('rixu.food.v1'); app=boot();
app.click('#add-course'); app.submit(app.course,{name:'课程中心测试',teacher:'张老师',description:'简介',start:'09:00',end:'10:00'});
app.click('#course-tab-all'); app.get('#course-all').children[0].handlers.click();
const centerSection = index => app.get('#course-detail').children[2].children[index];
function centerAdd(index, values) {
  centerSection(index).children[1].handlers.click();
  app.submit(app.get('#center-form'),values);
}
centerAdd(0,{title:'课程主页',url:'https://example.com',notes:'说明'});
centerAdd(0,{title:'第二个网址',url:'https://example.org'});
assert.equal(JSON.parse(storage.get('rixu.course.links.v1')).length,2);
centerAdd(1,{title:'教材',type:'PDF',fileName:'教材.pdf',notes:'本地文件信息'});
assert.equal(JSON.parse(storage.get('rixu.course.materials.v1'))[0].attachment.storage,'metadata');
centerAdd(2,{title:'较晚作业',status:'未完成',deadline:'2099-05-02T12:00'});
centerAdd(2,{title:'较早作业',status:'未完成',deadline:'2099-05-01T12:00'});
let assignmentCard=centerSection(2).children[2];
assert.equal(assignmentCard.children[0].textContent,'较早作业');
assignmentCard.children.at(-1).children[1].handlers.click();
assignmentCard.children.at(-1).children[1].handlers.click();
assert.equal(app.run('tasks.filter(task=>task.assignmentId).length'),1);
assert.equal(app.run('tasks.find(task=>task.assignmentId).deadline'),'2099-05-01T12:00');
assignmentCard.children.at(-1).children[2].handlers.click(); app.submit(app.get('#center-form'),{title:'作业修改',deadline:'2099-04-30T12:00'});
centerSection(2).children[2].children.at(-1).children[1].handlers.click();
assert.equal(app.run('tasks.find(task=>task.assignmentId).title'),'作业修改');
centerSection(2).children[2].children.at(-1).children[0].handlers.click();
assert.equal(JSON.parse(storage.get('rixu.course.assignments.v1')).find(row=>row.title==='作业修改').status,'已完成');
centerAdd(3,{title:'考试范围',content:'第1至8章',url:'https://example.com/exam'});
centerSection(3).children[2].children.at(-1).children[0].handlers.click(); app.submit(app.get('#center-form'),{content:'第1至9章'});
assert.equal(JSON.parse(storage.get('rixu.course.notes.v1'))[0].content,'第1至9章');
app=boot();app.click('#course-tab-all');app.get('#course-all').children[0].handlers.click();
assert.equal(centerSection(0).children.length,4);
assert.equal(centerSection(3).children[2].children[0].textContent,'考试范围');
centerSection(3).children[2].children.at(-1).children[1].handlers.click();
assert.equal(JSON.parse(storage.get('rixu.course.notes.v1')).length,0);
centerSection(2).children[2].children.at(-1).children[3].handlers.click();
assert.equal(JSON.parse(storage.get('rixu.course.assignments.v1')).length,1);
centerAdd(0,{title:'无效网址',url:'javascript:alert(1)'});
assert.match(app.get('#center-form-error').textContent,/http/);
assert.equal(JSON.parse(storage.get('rixu.course.links.v1')).length,2);
console.log('PASS: course details, separate link/material/assignment/note CRUD and reload, sorting, metadata-only attachments, safe URLs, task association and deduplication.');

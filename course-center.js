"use strict";

// Each entity has its own repository. Replace these adapters for a future cloud version.
function createCourseCenter(api) {
  const specs = {
    links: { label: '课程网址', fields: [['title','名称','text',true],['url','URL','url',true],['notes','备注','textarea']] },
    materials: { label: '课程资料', fields: [['title','名称','text',true],['type','类型','教材|PDF|课件|文档|图片|网站|其他'],['url','资料网址（可选）','url'],['fileName','文件名称（仅信息记录）','text'],['notes','备注','textarea']] },
    assignments: { label: '作业', fields: [['title','作业名称','text',true],['description','描述','textarea'],['publishedAt','发布时间','datetime-local'],['deadline','截止时间','datetime-local'],['status','状态','未完成|已完成'],['url','相关网址','url'],['notes','备注','textarea']] },
    notes: { label: '重要记录', fields: [['title','标题','text',true],['content','文本内容','textarea'],['url','网址或图片链接','url'],['fileName','图片或文件名称（仅信息记录）','text']] }
  };
  const repositories = {};
  let selected = null, view = 'table', editing = null;
  const notify = text => { $('#center-message').textContent = text; };
  const validUrl = value => { if (!value) return true; try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; } };
  for (const [kind, spec] of Object.entries(specs)) {
    const key = `rixu.course.${kind}.v1`;
    let data = [], readable = true;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(saved) || !saved.every(item => item && typeof item.id === 'string' && typeof item.courseId === 'string' && typeof item.title === 'string' && ['createdAt','updatedAt'].every(field => typeof item[field] === 'string' && Number.isFinite(new Date(item[field]).getTime())) && spec.fields.every(([field,,, required]) => (!required && item[field] === undefined) || typeof item[field] === 'string') && validUrl(item.url))) throw Error('Invalid data');
      if (new Set(saved.map(item => item.id)).size !== saved.length) throw Error('Duplicate IDs');
      data = saved;
    } catch { readable = false; notify(`${spec.label}数据无法读取，原数据不会被覆盖。`); }
    repositories[kind] = {
      all: () => data,
      save(next) {
        if (!readable) { notify(`${spec.label}原数据无法读取，暂不能保存。`); return false; }
        try { localStorage.setItem(key, JSON.stringify(next)); data = next; return true; }
        catch { notify('保存失败，请检查浏览器存储空间与权限。本次修改未保存。'); return false; }
      }
    };
  }
  function button(text, action) { const node = element('button','',text); node.type='button'; node.addEventListener('click',action); return node; }
  function link(url, title) { const node = element('a','center-link',title || url); node.href=url; node.target='_blank'; node.rel='noopener noreferrer'; return node; }
  function timing(course) { return `周${['一','二','三','四','五','六','日'][course.day-1]} ${course.start}–${course.end} · ${{every:'每周',odd:'单周',even:'双周'}[course.repeat]}`; }
  function dueText(item) {
    if (item.status === '已完成') return '已完成';
    if (!item.deadline) return '未设置截止时间';
    const deadline = new Date(item.deadline), now = new Date();
    if (!Number.isFinite(deadline.getTime())) return '截止时间无效';
    if (deadline < now) return '已逾期';
    const dayNumber = d => Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()) / 86400000;
    const days = dayNumber(deadline) - dayNumber(now);
    return days === 0 ? '今天截止' : days === 1 ? '明天截止' : `${days} 天后截止`;
  }
  const byDeadline = (a,b) => (a.deadline || '9999').localeCompare(b.deadline || '9999');
  function open(id) { selected=id; view='detail'; renderCenter(); $('#course-detail').scrollIntoView({block:'start'}); }
  function editor(kind, item) {
    editing={kind,id:item?.id || null,courseId:selected};
    $('#center-form').reset(); $('#center-fields').replaceChildren(); $('#center-form-error').textContent='';
    $('#center-form-heading').textContent=`${item ? '编辑' : '新增'}${specs[kind].label}`;
    for (const [name,label,type,required] of specs[kind].fields) {
      const caption=element('label','',label+(required?' *':'')); caption.htmlFor='center-'+name;
      let input;
      if (type.includes('|')) { input=element('select'); type.split('|').forEach(value=>input.add(new Option(value,value))); }
      else { input=element(type==='textarea'?'textarea':'input'); if(type!=='textarea') input.type=type; else input.rows=3; }
      input.id='center-'+name; input.name=name; input.required=Boolean(required); input.maxLength=type==='textarea'?10000:1000;
      input.value=item?.[name] || (type.includes('|')?type.split('|')[0]:name==='publishedAt'?`${localDate()}T${new Date().toTimeString().slice(0,5)}`:'');
      $('#center-fields').append(caption,input);
    }
    if(kind==='materials'||kind==='notes') $('#center-fields').append(element('p','muted','附件仅保存网址、文件名和备注，不上传或保存文件内容；刷新后本地文件需自行重新打开。'));
    $('#center-dialog').showModal(); $('#center-title').focus();
  }
  function addToTodo(item, course) {
    const existing=tasks.find(task=>task.assignmentId===item.id);
    const next=structuredClone(tasks);
    if(existing) {
      const task=next.find(task=>task.id===existing.id); task.title=item.title; task.deadline=item.deadline || ''; task.courseName=course.name;
    } else next.unshift({id:crypto.randomUUID(),title:item.title,tags:[course.name],date:item.deadline?.slice(0,10)||'',deadline:item.deadline||'',repeat:'none',status:item.status==='已完成'?'done':'todo',assignmentId:item.id,courseId:course.id,courseName:course.name});
    if(persist(next)) { render(); notify(existing?'已更新关联待办的标题、课程和截止时间。':'已加入待办。重复点击只更新同一条待办。'); }
    else notify('加入待办失败，请检查待办存储提示。');
  }
  function entry(kind,item,course) {
    const card=element('article','center-entry'); card.append(element('h4','',item.title));
    if(kind==='assignments') card.append(element('p','center-due',`${dueText(item)}${item.deadline?' · '+item.deadline.replace('T',' '):''}`));
    for(const [field,label] of [['type','类型'],['description','描述'],['content','内容'],['fileName','文件信息'],['publishedAt','发布'],['notes','备注']]) if(item[field]) card.append(element('p','center-text',`${label}：${item[field]}`));
    if(item.url && validUrl(item.url)) card.append(link(item.url,'打开'+(kind==='links'?item.title:'相关网址')));
    card.append(element('small','',`添加：${new Date(item.createdAt).toLocaleString('zh-CN')} · 更新：${new Date(item.updatedAt).toLocaleString('zh-CN')}`));
    const actions=element('div','actions');
    if(kind==='assignments') {
      actions.append(button(item.status==='已完成'?'标记未完成':'标记完成',()=>{
        const next=repositories[kind].all().map(row=>row.id===item.id?{...row,status:item.status==='已完成'?'未完成':'已完成',updatedAt:new Date().toISOString()}:row);
        if(repositories[kind].save(next)) renderCenter();
      }),button('加入 / 更新待办',()=>addToTodo(item,course)));
    }
    actions.append(button('编辑',()=>editor(kind,item)),button('删除',()=>{if(confirm(`确定删除“${item.title}”吗？`) && repositories[kind].save(repositories[kind].all().filter(row=>row.id!==item.id))) renderCenter();}));
    card.append(actions); return card;
  }
  function renderCenter() {
    const courses=api.getCourses();
    if(selected && !courses.some(course=>course.id===selected)) { selected=null; view='all'; }
    $('#course-table-view').hidden=view!=='table'; $('#course-all').hidden=view!=='all'; $('#course-detail').hidden=view!=='detail';
    $('#course-tab-table').setAttribute('aria-pressed',String(view==='table')); $('#course-tab-all').setAttribute('aria-pressed',String(view==='all'));
    const recent=$('#course-recent'); recent.replaceChildren(element('h3','','最近内容'));
    const activeIds=new Set(courses.map(course=>course.id));
    const upcoming=repositories.assignments.all().filter(item=>activeIds.has(item.courseId)&&item.status!=='已完成').sort(byDeadline).slice(0,3);
    const notes=repositories.notes.all().filter(item=>activeIds.has(item.courseId)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,3);
    for(const item of upcoming) recent.append(button(`${item.title} · ${dueText(item)}`,()=>open(item.courseId)));
    for(const item of notes) recent.append(button(`记录 · ${item.title}`,()=>open(item.courseId)));
    if(!upcoming.length&&!notes.length) recent.append(element('p','muted','课程作业和重要记录会显示在这里。'));
    $('#course-all').replaceChildren();
    if(!courses.length) $('#course-all').append(element('p','panel center-section','还没有课程，点击“添加课程”开始。'));
    for(const course of courses) {
      const card=button('',()=>open(course.id)); card.className='panel center-course';
      card.append(element('h3','',course.name),element('p','',`教师：${course.teacher||'未填写'}`),element('p','',timing(course)),element('p','',`地点：${course.location||'未填写'}`),element('p','center-due',`${repositories.assignments.all().filter(item=>item.courseId===course.id&&item.status!=='已完成').length} 项未完成作业`));
      $('#course-all').append(card);
    }
    const detail=$('#course-detail'); detail.replaceChildren();
    const course=courses.find(item=>item.id===selected); if(!course) return;
    detail.append(button('← 所有课程',()=>{view='all';renderCenter();}));
    const info=element('section','panel center-section');
    info.append(element('h2','',course.name),element('p','center-text',`教师：${course.teacher||'未填写'}\n${timing(course)}\n地点：${course.location||'未填写'}\n${course.description||'暂无课程简介'}`),button('编辑课程信息',()=>api.edit(course)));
    detail.append(info);
    const grid=element('div','center-detail-grid');
    for(const [kind,spec] of Object.entries(specs)) {
      const section=element('section','panel center-section'); section.append(element('h3','',spec.label),button('＋ 新增'+spec.label,()=>editor(kind)));
      const rows=repositories[kind].all().filter(item=>item.courseId===course.id);
      rows.sort(kind==='assignments'?byDeadline:(a,b)=>b.createdAt.localeCompare(a.createdAt));
      if(!rows.length) section.append(element('p','muted','暂无内容。'));
      rows.forEach(item=>section.append(entry(kind,item,course))); grid.append(section);
    }
    detail.append(grid);
  }
  $('#center-form').addEventListener('submit',event=>{
    event.preventDefault(); if(!editing) return;
    const {kind,id,courseId}=editing, repo=repositories[kind];
    const data=new FormData($('#center-form')), now=new Date().toISOString();
    const old=repo.all().find(item=>item.id===id);
    const item={...old,id:id||crypto.randomUUID(),courseId,createdAt:old?.createdAt||now,updatedAt:now};
    for(const [field,,,required] of specs[kind].fields) {
      item[field]=String(data.get(field)||'').trim();
      if(required&&!item[field]) { $('#center-form-error').textContent='请填写必填名称。';return; }
    }
    if(!validUrl(item.url)) { $('#center-form-error').textContent='网址必须是完整的 http:// 或 https:// 地址。';return; }
    if(kind==='assignments'&&['publishedAt','deadline'].some(field=>item[field]&&!Number.isFinite(new Date(item[field]).getTime()))) { $('#center-form-error').textContent='请填写有效日期时间。';return; }
    // Metadata only: no Base64 or browser-local object URLs. Future cloud adapters can use objectKey.
    if(kind==='materials'||kind==='notes') item.attachment={storage:'metadata',fileName:item.fileName||'',objectKey:old?.attachment?.objectKey||null};
    const next=id?repo.all().map(row=>row.id===id?item:row):[...repo.all(),item];
    if(repo.save(next)) { $('#center-dialog').close();renderCenter();notify('已保存。'); }
    else $('#center-form-error').textContent=$('#center-message').textContent;
  });
  $('#center-cancel').addEventListener('click',()=>$('#center-dialog').close());
  $('#course-tab-table').addEventListener('click',()=>{view='table';renderCenter();});
  $('#course-tab-all').addEventListener('click',()=>{view='all';renderCenter();});
  return {open,render:renderCenter};
}

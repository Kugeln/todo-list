"use strict";

// OCR is an optional import adapter. Only api.save writes the existing Course store.
const CourseImportParser = (() => {
  const timePattern = /([01]?\d|2[0-3])[:：]([0-5]\d)\s*[-—–~～至到]\s*([01]?\d|2[0-3])[:：]([0-5]\d)/;
  const dayPattern = /(?:星期|周|礼拜)\s*([一二三四五六日天1-7])/;
  const dayNumber = s => /[1-7]/.test(s) ? Number(s) : '一二三四五六日'.indexOf(s === '天' ? '日' : s) + 1;
  const validTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  function periods(text) {
    const found = text.match(/第?\s*(\d{1,2})(?:\s*[-~～至、,，]\s*(\d{1,2}))?\s*节/g) || [];
    return [...new Set(found.flatMap(s => {
      const n = s.match(/\d+/g).map(Number);
      if (n.length === 1) return n;
      return n[1] >= n[0] && n[1] - n[0] < 30 ? Array.from({length:n[1]-n[0]+1},(_,i)=>n[0]+i) : n;
    }))].sort((a,b)=>a-b);
  }
  function parse(text, lines = []) {
    text = text.replace(/([\u4e00-\u9fff])[ \t]+(?=[\u4e00-\u9fff])/g,'$1');
    lines = lines.map(l => ({...l,text:l.text.replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g,'$1')}));
    const headers = lines.filter(l => dayPattern.test(l.text) && l.text.trim().length <= 5 && l.bbox);
    const rows = lines.filter(l => l.bbox && l.bbox.x1 < Math.min(...headers.map(h=>h.bbox.x0)) && (timePattern.test(l.text) || /^第?\s*\d.*节$/.test(l.text.trim())));
    let groups;
    if (new Set(headers.map(h=>dayNumber(h.text.match(dayPattern)[1]))).size >= 3) {
      const buckets = new Map();
      for (const line of lines) {
        if (!line.bbox || headers.includes(line) || rows.includes(line) || line.bbox.y0 <= Math.max(...headers.map(h=>h.bbox.y1))) continue;
        const x=(line.bbox.x0+line.bbox.x1)/2, y=(line.bbox.y0+line.bbox.y1)/2;
        const header=headers.reduce((a,b)=>Math.abs((a.bbox.x0+a.bbox.x1)/2-x)<Math.abs((b.bbox.x0+b.bbox.x1)/2-x)?a:b);
        const row=rows.filter(r=>r.bbox.x1 < Math.min(...headers.map(h=>h.bbox.x0))).reduce((a,b)=>!a || Math.abs((b.bbox.y0+b.bbox.y1)/2-y)<Math.abs((a.bbox.y0+a.bbox.y1)/2-y)?b:a,null);
        const key=header.text+':'+(row?row.bbox.y0:Math.floor(y/80));
        if(!buckets.has(key)) buckets.set(key,{text:[],day:dayNumber(header.text.match(dayPattern)[1]),row:row?.text||''});
        buckets.get(key).text.push(line.text);
      }
      groups=[...buckets.values()].map(g=>({text:g.text.join('\n'),day:g.day,row:g.row}));
    } else {
      groups=text.trim().split(/\n\s*\n/).filter(Boolean).map(text=>({text,day:0,row:''}));
      if(groups.length===1) {
        const split=[];
        for(const line of text.split('\n')) {
          const day=line.match(dayPattern);
          if(split.length && day && line.slice(0,day.index).trim()) split.push(line);
          else if(split.length) split[split.length-1]+='\n'+line;
          else if(line.trim()) split.push(line);
        }
        groups=split.map(text=>({text,day:0,row:''}));
      }
    }
    return groups.map(g=>{
      const raw=g.text.trim(), combined=raw+'\n'+g.row, t=combined.match(timePattern), d=raw.match(dayPattern);
      const field=label=>raw.match(new RegExp('(?:'+label+')\\s*[：:]\\s*([^\\n;；]+)'))?.[1]?.trim()||'';
      const first=raw.split('\n').find(s=>s.trim())||'';
      const name=field('课程名称|课程|名称') || first.replace(dayPattern,'').replace(timePattern,'').replace(/第?\s*\d+(?:\s*[-~～至、,，]\s*\d+)?\s*节/g,'').trim();
      return {name,day:d?dayNumber(d[1]):g.day,start:t?`${t[1].padStart(2,'0')}:${t[2]}`:'',end:t?`${t[3].padStart(2,'0')}:${t[4]}`:'',periods:periods(combined).join(','),location:field('地点|教室'),teacher:field('教师|老师'),repeat:/单周/.test(raw)?'odd':/双周/.test(raw)?'even':'every',notes:raw+(g.row?'\n行信息：'+g.row:''),selected:true};
    });
  }
  function applyMapping(candidate, mapping) {
    if(candidate.start || candidate.end) return candidate; // Explicit or manually entered times always win.
    const nums=periods(candidate.periods.replace(/(\d+)/g,'第$1节'));
    if(!nums.length || !nums.every(n=>mapping[n] && validTime(mapping[n].start) && validTime(mapping[n].end) && mapping[n].end>mapping[n].start)) return candidate;
    return {...candidate,start:mapping[nums[0]].start,end:mapping[nums.at(-1)].end};
  }
  const duplicate=(a,b)=>a.name.trim().replace(/\s/g,'')===b.name.trim().replace(/\s/g,'') && Number(a.day)===Number(b.day) && a.start===b.start && a.end===b.end;
  return {parse,periods,applyMapping,validTime,duplicate};
})();
if (typeof module !== 'undefined' && module.exports) module.exports=CourseImportParser;

function createCourseImport(api) {
  const key='rixu.course.import.v1';
  const el=(tag,cls,text)=>element(tag,cls,text);
  const button=(text,fn)=>{const b=el('button','',text);b.type='button';b.addEventListener('click',fn);return b;};
  let candidates=[], imageURL='', worker=null, busy=false, mapping={}, prefsReadable=true;
  const entry=button('从截图导入课程表',()=>dialog.showModal());
  $('#add-course').parentElement.append(entry);
  const dialog=el('dialog','import-dialog');dialog.setAttribute('aria-label','从截图导入课程表');
  const heading=el('div','list-header');heading.append(el('h2','','从截图导入课程表'),button('关闭',()=>dialog.close()));
  const intro=el('p','muted','图片在浏览器内识别。首次需联网下载中文 OCR 引擎。请核对每门课程；周次范围仅记入备注，课表仍按每周 / 单周 / 双周显示。');
  const upload=el('input');upload.type='file';upload.accept='image/png,image/jpeg,image/webp';upload.setAttribute('aria-label','上传课程表截图');
  const preview=el('img','import-preview');preview.alt='待识别课程表截图';preview.hidden=true;
  const progress=el('p','muted');progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
  const message=el('p','import-message');message.setAttribute('role','alert');
  const raw=el('textarea');raw.rows=7;raw.setAttribute('aria-label','原始 OCR 文本，可修改后重新解析');
  const rawDetails=el('details');rawDetails.append(el('summary','','原始 OCR 文本（可修改）'),raw,button('按文本重新解析',()=>replaceCandidates(CourseImportParser.parse(raw.value))));
  const mapInput=el('textarea');mapInput.rows=4;mapInput.placeholder='1=08:00-08:50\n2=09:00-09:50';mapInput.setAttribute('aria-label','节次时间映射，每行如 1=08:00-08:50');
  const mapDetails=el('details');mapDetails.append(el('summary','','节次 → 时间映射'),el('p','muted','每行填写：1=08:00-08:50。只补全尚未填写时间的课程；截图或手工时间优先。'),mapInput,button('保存映射并补全',()=>{
    const next={};
    for(const line of mapInput.value.split('\n').filter(s=>s.trim())) {
      const m=line.trim().match(/^(\d{1,2})\s*=\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
      if(!m || +m[1]<1 || !CourseImportParser.validTime(m[2]) || !CourseImportParser.validTime(m[3]) || m[3]<=m[2]) {message.textContent='映射格式或时间无效，请按示例填写，结束时间须晚于开始时间。';return;}
      next[+m[1]]={start:m[2],end:m[3]};
    }
    mapping=next;savePrefs();candidates=candidates.map(c=>CourseImportParser.applyMapping(c,mapping));render();
  }));
  const language=el('select');language.setAttribute('aria-label','OCR 语言');language.append(new Option('简体中文 + 英文','chi_sim+eng'),new Option('繁体中文 + 英文','chi_tra+eng'));language.value='chi_sim+eng';language.addEventListener('change',savePrefs);
  function savePrefs(){if(!prefsReadable){message.textContent='导入设置无法读取，原设置不会被覆盖。';return;}try{localStorage.setItem(key,JSON.stringify({mapping,language:language.value}));message.textContent='导入设置已保存。';}catch{message.textContent='设置保存失败，本次会话仍可使用，请检查浏览器存储权限。';}}
  try{const p=JSON.parse(localStorage.getItem(key)||'{}');if(!p || typeof p!=='object' || (p.mapping && (typeof p.mapping!=='object' || Array.isArray(p.mapping)))) throw Error();mapping=p.mapping||{};if(['chi_sim+eng','chi_tra+eng'].includes(p.language))language.value=p.language;mapInput.value=Object.entries(mapping).map(([n,t])=>`${n}=${t.start}-${t.end}`).join('\n');}catch{prefsReadable=false;message.textContent='无法读取导入设置，已有设置不会被覆盖。可手动校对课程。';}
  const list=el('div','import-candidates');
  function replaceCandidates(next){if(candidates.length && !confirm('重新解析将替换当前候选课程和校对修改，是否继续？'))return;candidates=next.map(c=>CourseImportParser.applyMapping(c,mapping));render();}
  function render(){
    list.replaceChildren();
    if(!candidates.length)list.append(el('p','muted','暂无候选课程。上传识别、粘贴文字解析，或手动新增课程。'));
    candidates.forEach((c,index)=>{
      const card=el('article','panel import-candidate');
      const selected=el('input');selected.type='checkbox';selected.checked=c.selected;selected.addEventListener('change',()=>c.selected=selected.checked);
      const label=el('label','import-selection');label.append(selected,el('span','',`导入第 ${index+1} 门课程`));card.append(label);
      const fields=el('div','import-fields');
      const definitions=[['name','课程名称','text'],['day','星期','select', [['0','请选择'],...['一','二','三','四','五','六','日'].map((s,i)=>[String(i+1),'周'+s])]],['start','开始时间','time'],['end','结束时间','time'],['periods','节次（逗号分隔，如 5,6）','text'],['location','地点','text'],['teacher','教师','text'],['repeat','重复规则','select',[['every','每周'],['odd','单周'],['even','双周']]],['notes','备注 / 原始文字 / 周次','textarea']];
      for(const [key,title,type,options] of definitions){
        const wrap=el('label');wrap.append(el('span','',title));const input=el(type==='select'?'select':type==='textarea'?'textarea':'input');
        if(options)options.forEach(([value,text])=>input.append(new Option(text,value)));else if(type!=='textarea')input.type=type;
        input.value=String(c[key]??'');input.addEventListener('input',()=>{c[key]=key==='day'?Number(input.value):input.value;});wrap.append(input);fields.append(wrap);
      }
      card.append(fields,el('p','muted',!c.start||!c.end?'需要补充时间：填写开始/结束时间，或保存节次映射。':'请核对课程名称、星期、时间及重复规则。'),button('删除此候选',()=>{candidates.splice(index,1);render();}));list.append(card);
    });
  }
  let enginePromise;
  function loadEngine(){
    if(globalThis.Tesseract)return Promise.resolve(globalThis.Tesseract);
    if(!enginePromise)enginePromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';const timer=setTimeout(()=>{script.remove();enginePromise=null;reject(Error('引擎下载超时'));},45000);script.onload=()=>{clearTimeout(timer);resolve(globalThis.Tesseract);};script.onerror=()=>{clearTimeout(timer);script.remove();enginePromise=null;reject(Error('引擎下载失败'));};document.head.append(script);});
    return enginePromise;
  }
  const recognize=button('开始 / 重新识别',async()=>{
    if(busy)return;if(!imageURL){message.textContent='请先上传图片，也可以直接手动新增课程。';return;}
    busy=true;recognize.disabled=true;upload.disabled=true;language.disabled=true;message.textContent='';progress.textContent='正在加载 OCR 引擎…';
    let timeout, expired=false;
    try {
      const data=await Promise.race([(async()=>{const engine=await loadEngine();if(expired)throw Error('识别已超时');const activeWorker=await engine.createWorker(language.value.split('+'),1,{logger:m=>{if(!expired)progress.textContent=`识别进度：${Math.round((m.progress||0)*100)}% · ${m.status}`;}});if(expired){await activeWorker.terminate();throw Error('识别已超时');}worker=activeWorker;const result=await activeWorker.recognize(imageURL,{}, {text:true,blocks:true});return result.data;})(),new Promise((_,reject)=>{timeout=setTimeout(()=>{expired=true;reject(Error('识别超时，请缩小图片后重试'));},180000);})]);
      raw.value=data.text||'';
      const lines=(data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]));
      replaceCandidates(CourseImportParser.parse(raw.value,lines));progress.textContent='识别完成。请逐条校对后确认导入。';
    }catch(error){progress.textContent='识别未完成。';message.textContent=`${error.message}。可重试、粘贴原始文字或手动新增课程。`;}
    finally{clearTimeout(timeout);if(worker){await worker.terminate().catch(()=>{});worker=null;}busy=false;recognize.disabled=false;upload.disabled=false;language.disabled=false;}
  });
  upload.addEventListener('change',()=>{const file=upload.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){message.textContent='请选择 PNG、JPG、JPEG 或 WebP 图片。';return;}if(file.size>20*1024*1024){message.textContent='图片超过 20 MB，请裁剪或缩小后重试。';return;}if(imageURL)URL.revokeObjectURL(imageURL);imageURL=URL.createObjectURL(file);preview.src=imageURL;preview.hidden=false;message.textContent='图片已载入，点击开始识别。';});
  const commit=button('确认导入已选课程',()=>{
    const selected=candidates.filter(c=>c.selected);
    if(!selected.length){message.textContent='请先选择至少一门课程。';return;}
    if(selected.some(c=>!c.name.trim() || !Number.isInteger(c.day) || c.day<1 || c.day>7 || !CourseImportParser.validTime(c.start) || !CourseImportParser.validTime(c.end) || c.end<=c.start)){message.textContent='请补全所选课程的名称、星期及有效时间（结束须晚于开始），或取消勾选该课程。';return;}
    const next=[...api.getCourses()];let duplicates=0;
    for(const c of selected){if(next.some(item=>CourseImportParser.duplicate(item,c)))duplicates++;const {selected:checked,...course}=c;next.push({...course,id:crypto.randomUUID(),name:c.name.trim(),description:'',notes:[c.notes,c.periods?'节次：'+c.periods:''].filter(Boolean).join('\n')});}
    if(duplicates && !confirm(`发现 ${duplicates} 门同名、同星期、同时间的重复课程（含本次候选）。仍要重复导入吗？取消可返回校对。`))return;
    if(!api.save(next)){message.textContent='课程保存失败，原数据未更改。请检查存储权限或空间。';return;}
    candidates=candidates.filter(c=>!c.selected);render();message.textContent=`已成功导入 ${selected.length} 门课程。可关闭窗口查看课程表和课程详情。`;
  });commit.className='primary';
  const actions=el('div','actions');actions.append(language,recognize);
  dialog.append(heading,intro,upload,preview,actions,progress,message,rawDetails,mapDetails,el('h3','','识别结果预览'),list,button('手动新增候选课程',()=>{candidates.push({name:'',day:0,start:'',end:'',periods:'',location:'',teacher:'',repeat:'every',notes:'',selected:true});render();}),commit);
  document.body.append(dialog);render();
}

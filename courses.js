"use strict";

// Separate storage and scope keep course changes independent of existing tasks.
(() => {
  const COURSES_KEY = "rixu.courses.v1";
  const SEMESTER_KEY = "rixu.semesterStart.v1";
  const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const labels = { every: "每周", odd: "单周", even: "双周" };
  const courseForm = $("#course-form");
  const dialog = $("#course-dialog");
  let courses = [];
  let readable = true;
  let editingCourse = null;
  let semester = "";
  const monday = value => {
    const date = new Date(value);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (date.getDay() + 6) % 7);
    return date;
  };
  let week = monday(new Date());
  const notify = text => { $("#course-message").textContent = text; };
  const dateNumber = value => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
  };
  function weekNumber() {
    return semester ? Math.floor((dateNumber(localDate(week)) - dateNumber(semester)) / 7) + 1 : null;
  }
  function save(next) {
    if (!readable) { $("#course-form-message").textContent = "已有课程无法读取，为避免覆盖，暂不能保存。"; notify("已有课程无法读取，原数据不会被覆盖。"); return false; }
    try { localStorage.setItem(COURSES_KEY, JSON.stringify(next)); courses = next; return true; }
    catch { $("#course-form-message").textContent = "课程保存失败，请检查浏览器存储空间和权限。"; notify("课程保存失败，本次修改尚未保存。"); return false; }
  }
  function openEditor(course) {
    courseForm.reset();
    editingCourse = course?.id || null;
    $("#course-form-heading").textContent = course ? "编辑课程" : "添加课程";
    $("#course-form-message").textContent = "";
    if (course) for (const key of ["name", "day", "repeat", "start", "end", "location", "notes"]) courseForm.elements[key].value = course[key];
    dialog.showModal();
    courseForm.elements.name.focus();
  }
  function renderCourses() {
    const number = weekNumber();
    const end = new Date(week); end.setDate(end.getDate() + 6);
    const suffix = number === null ? "未设置教学周" : number < 1 ? "学期开始前" : `第 ${number} 周 · ${number % 2 ? "单周" : "双周"}`;
    $("#week-label").textContent = `${localDate(week)} — ${localDate(end)} · ${suffix}`;
    const visible = courses.filter(course => number === null || (number >= 1 && (course.repeat === "every" || course.repeat === (number % 2 ? "odd" : "even"))));
    $("#course-summary").textContent = `共 ${courses.length} 门课程 · 本周显示 ${visible.length} 门${number === null ? "（每周、单周、双周均显示）" : ""}`;
    $("#week-grid").replaceChildren();
    days.forEach((label, index) => {
      const date = new Date(week); date.setDate(date.getDate() + index);
      const column = element("section", "day-column");
      const heading = element("h3", localDate(date) === localDate() ? "day-heading is-today" : "day-heading", label);
      heading.append(element("span", "", localDate(date).slice(5)));
      column.append(heading);
      const daily = visible.filter(course => course.day === index + 1).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
      if (!daily.length) column.append(element("p", "day-empty", "暂无课程"));
      daily.forEach(course => {
        const card = element("article", "course-card");
        card.append(element("p", "course-time", `${course.start} – ${course.end}`), element("h4", "", course.name), element("span", "tag", labels[course.repeat]));
        if (course.location) card.append(element("p", "course-location", `地点：${course.location}`));
        if (course.notes) card.append(element("p", "course-notes", course.notes));
        const actions = element("div", "actions");
        const edit = element("button", "", "编辑"); edit.type = "button"; edit.addEventListener("click", () => openEditor(course));
        const remove = element("button", "", "删除"); remove.type = "button";
        remove.addEventListener("click", () => {
          if (confirm(`确定删除课程“${course.name}”吗？`) && save(courses.filter(item => item.id !== course.id))) { notify("课程已删除。"); renderCourses(); }
        });
        actions.append(edit, remove); card.append(actions); column.append(card);
      });
      $("#week-grid").append(column);
    });
  }
  courseForm.addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(courseForm);
    const course = { id: editingCourse || crypto.randomUUID(), name: data.get("name").trim(), day: Number(data.get("day")), repeat: data.get("repeat"), start: data.get("start"), end: data.get("end"), location: data.get("location").trim(), notes: data.get("notes").trim() };
    if (!course.name) { $("#course-form-message").textContent = "请输入课程名称。"; return; }
    if (!course.start || !course.end || course.end <= course.start) { $("#course-form-message").textContent = "结束时间须晚于开始时间，请按同一天的课程填写。"; return; }
    const next = editingCourse ? courses.map(item => item.id === editingCourse ? course : item) : [...courses, course];
    if (save(next)) { dialog.close(); notify(editingCourse ? "课程修改已保存。" : "课程已添加。"); renderCourses(); }
  });
  $("#add-course").addEventListener("click", () => openEditor());
  ["#close-course", "#cancel-course"].forEach(selector => $(selector).addEventListener("click", () => dialog.close()));
  $("#prev-week").addEventListener("click", () => { week.setDate(week.getDate() - 7); renderCourses(); });
  $("#next-week").addEventListener("click", () => { week.setDate(week.getDate() + 7); renderCourses(); });
  $("#this-week").addEventListener("click", () => { week = monday(new Date()); renderCourses(); });
  $("#semester-start").addEventListener("change", event => {
    const value = event.target.value;
    if (value && new Date(`${value}T12:00:00`).getDay() !== 1) { event.target.value = semester; notify("请选择学期第一周的周一。设置未更改。"); return; }
    try { localStorage.setItem(SEMESTER_KEY, value); semester = value; notify(value ? "学期起始日期已保存。" : "已清除学期设置，展示所有课程。"); renderCourses(); }
    catch { event.target.value = semester; notify("学期设置保存失败，本次设置未更改。"); }
  });
  const modules = { tasks: "todo-module", courses: "course-module", food: "food-module" };
  Object.keys(modules).forEach(module => $("#show-" + module).addEventListener("click", () => {
    Object.entries(modules).forEach(([name, id]) => {
      $("#" + id).hidden = name !== module;
      $("#show-" + name).setAttribute("aria-pressed", String(name === module));
    });
  }));
  try {
    const saved = JSON.parse(localStorage.getItem(COURSES_KEY) || "[]");
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!Array.isArray(saved) || !saved.every(course => course && ["id", "name", "location", "notes"].every(key => typeof course[key] === "string") && Number.isInteger(course.day) && course.day >= 1 && course.day <= 7 && Object.hasOwn(labels, course.repeat) && time.test(course.start) && time.test(course.end) && course.end > course.start)) throw Error("Invalid courses");
    courses = saved;
  } catch { readable = false; notify("无法读取已保存的课程，原数据不会被覆盖。待办功能不受影响。"); }
  try {
    const value = localStorage.getItem(SEMESTER_KEY) || "";
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T12:00:00`).getDay() !== 1)) throw Error("Invalid semester");
    semester = value; $("#semester-start").value = semester;
  } catch { notify("无法读取学期设置，暂时展示所有课程。"); }
  renderCourses();
})();

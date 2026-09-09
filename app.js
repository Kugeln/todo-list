"use strict";

const STORAGE_KEY = "rixu.tasks.v1";
const statuses = { todo: "未完成", doing: "进行中", done: "已完成" };
const repeats = { none: "不循环", daily: "每天", weekly: "每周", monthly: "每月", custom: "自定义" };
const repeatUnits = { days: "天", weeks: "周", months: "月" };
const HIDE_KEY = "rixu.hideCompleted.v1";
const $ = (selector) => document.querySelector(selector);
const form = $("#task-form");
let tasks = [];
let editingId = null;
let statusFilter = "all";
let storageReadable = true;
let hideCompleted = false;

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nextDate(value, repeat, anchorDay, interval = 1, unit = "days") {
  const date = new Date(`${value}T12:00:00`);
  const count = repeat === "custom" ? interval : 1;
  const period = repeat === "custom" ? unit : ({ daily: "days", weekly: "weeks", monthly: "months" })[repeat];
  if (period === "months") {
    date.setDate(1);
    date.setMonth(date.getMonth() + count);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(anchorDay || Number(value.slice(8, 10)), lastDay));
  } else {
    date.setDate(date.getDate() + count * (period === "weeks" ? 7 : 1));
  }
  return localDate(date);
}

function completeRecurrence(task, collection) {
  if (task.status !== "done" || task.repeat === "none" || task.nextCreated) return;
  const base = task.date || localDate();
  task.anchorDay ||= Number(base.slice(8, 10));
  const date = nextDate(base, task.repeat, task.anchorDay, task.repeatInterval, task.repeatUnit);
  let deadline = "";
  if (task.deadline) {
    // Shift the deadline by the same calendar-day distance as the task date.
    const days = Math.round((new Date(`${date}T12:00:00`) - new Date(`${base}T12:00:00`)) / 86400000);
    const shifted = new Date(task.deadline);
    shifted.setDate(shifted.getDate() + days);
    deadline = `${localDate(shifted)}T${task.deadline.slice(11, 16)}`;
  }
  collection.unshift({ ...task, id: crypto.randomUUID(), date, deadline, status: "todo", nextCreated: false });
  task.nextCreated = true;
}

function announce(message) { $("#message").textContent = message; }
function persist(next) {
  if (!storageReadable) { announce("已有数据无法读取，为避免覆盖，请先检查浏览器存储设置或备份原数据。"); return false; }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); tasks = next; return true; }
  catch { announce("保存失败：浏览器存储不可用或空间不足。本次修改尚未保存。"); return false; }
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function render() {
  const selectedTag = $("#tag-filter").value;
  const tags = [...new Set(tasks.flatMap(task => task.tags))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  $("#tag-filter").replaceChildren(new Option("全部标签", ""), ...tags.map(tag => new Option(tag, tag)));
  $("#tag-filter").value = tags.includes(selectedTag) ? selectedTag : "";
  const visible = tasks.filter(task => (!hideCompleted || task.status !== "done") && (statusFilter === "all" || task.status === statusFilter) && (!$("#tag-filter").value || task.tags.includes($("#tag-filter").value)));
  $("#summary").textContent = `${tasks.length} 项待办 · ${tasks.filter(task => task.status === "done").length} 项已完成`;
  $("#tasks").replaceChildren();
  for (const task of visible) {
    const card = element("article", `task panel ${task.status}`);
    const top = element("div", "task-top");
    top.append(element("h3", "", task.title));
    const select = element("select", "task-status");
    select.setAttribute("aria-label", `${task.title}的状态`);
    for (const [value, label] of Object.entries(statuses)) select.add(new Option(label, value));
    select.value = task.status;
    select.addEventListener("change", () => {
      const next = structuredClone(tasks);
      const changed = next.find(item => item.id === task.id);
      changed.status = select.value;
      completeRecurrence(changed, next);
      if (persist(next)) {
        if (editingId === task.id) form.elements.status.value = changed.status;
        announce("状态已更新。");
      }
      render();
    });
    top.append(select);
    const metadata = element("div", "metadata");
    if (task.date) metadata.append(element("span", "", `日期 ${task.date}`));
    if (task.deadline) {
      const overdue = task.status !== "done" && new Date(task.deadline) < new Date();
      metadata.append(element("span", overdue ? "overdue" : "", `${overdue ? "已逾期 · " : "截止 "}${task.deadline.replace("T", " ")}`));
    }
    if (task.repeat !== "none") metadata.append(element("span", "", `↻ ${task.repeat === "custom" ? `每隔 ${task.repeatInterval} ${repeatUnits[task.repeatUnit]}` : repeats[task.repeat]}`));
    const bottom = element("div", "task-bottom");
    const tagList = element("div", "tags");
    task.tags.forEach(tag => tagList.append(element("span", "tag", tag)));
    const actions = element("div", "actions");
    const edit = element("button", "", "编辑");
    edit.type = "button";
    edit.addEventListener("click", () => startEdit(task));
    const remove = element("button", "", "删除");
    remove.type = "button";
    remove.addEventListener("click", () => {
      if (!confirm(`确定删除“${task.title}”吗？`)) return;
      if (persist(tasks.filter(item => item.id !== task.id))) {
        if (editingId === task.id) resetForm();
        announce("待办已删除。"); render();
      }
    });
    actions.append(edit, remove); bottom.append(tagList, actions); card.append(top, metadata, bottom); $("#tasks").append(card);
  }
  $("#empty").hidden = visible.length > 0;
  $("#empty h3").textContent = tasks.length ? "没有符合条件的待办" : "从一件小事开始";
  $("#empty p").textContent = tasks.length ? "试试其他状态或标签。" : "添加你的第一条待办，给今天一点方向。";
  if (hideCompleted && statusFilter === "done") {
    $("#empty h3").textContent = "已完成事项已隐藏";
    $("#empty p").textContent = "关闭“隐藏已完成”开关，即可查看此分类。";
  } else if (hideCompleted && !visible.length && tasks.length) {
    $("#empty p").textContent = "试试其他状态或标签，也可以关闭“隐藏已完成”。";
  }
}
function syncRepeatFields() {
  const custom = form.elements.repeat.value === "custom";
  $("#custom-repeat").hidden = !custom;
  form.elements.repeatInterval.disabled = !custom;
  form.elements.repeatInterval.required = custom;
  form.elements.repeatUnit.disabled = !custom;
}
function resetForm() {
  editingId = null; form.reset(); $("#form-heading").textContent = "添加待办"; $("#save").textContent = "＋ 添加待办"; $("#cancel").hidden = true;
  syncRepeatFields();
}
function startEdit(task) {
  editingId = task.id;
  for (const name of ["title", "date", "deadline", "repeat", "status"]) form.elements[name].value = task[name];
  form.elements.tags.value = task.tags.join("，");
  form.elements.repeatInterval.value = task.repeatInterval || 1;
  form.elements.repeatUnit.value = task.repeatUnit || "days";
  syncRepeatFields();
  $("#form-heading").textContent = "编辑待办"; $("#save").textContent = "保存修改"; $("#cancel").hidden = false;
  form.elements.title.focus();
}
form.addEventListener("submit", event => {
  event.preventDefault();
  const data = new FormData(form);
  const title = data.get("title").trim();
  if (!title) { announce("请输入任务名称，不能只填写空格。"); form.elements.title.focus(); return; }
  const repeatInterval = Number(data.get("repeatInterval") || 1);
  const repeatUnit = data.get("repeatUnit") || "days";
  if (data.get("repeat") === "custom" && (!Number.isInteger(repeatInterval) || repeatInterval < 1 || repeatInterval > 999 || !Object.hasOwn(repeatUnits, repeatUnit))) {
    announce("循环间隔请输入 1 至 999 的整数，并选择天、周或月。"); return;
  }
  const next = structuredClone(tasks);
  const old = next.find(task => task.id === editingId);
  const task = { ...old, id: old?.id || crypto.randomUUID(), title, tags: [...new Set(data.get("tags").split(/[,，]/).map(tag => tag.trim()).filter(Boolean))], date: data.get("date"), deadline: data.get("deadline"), repeat: data.get("repeat"), status: data.get("status") };
  task.repeatInterval = repeatInterval;
  task.repeatUnit = repeatUnit;
  if (old?.date !== task.date || old?.repeat !== task.repeat || (old?.repeatInterval || 1) !== repeatInterval || (old?.repeatUnit || "days") !== repeatUnit) task.anchorDay = Number((task.date || localDate()).slice(8, 10));
  if (old) next[next.findIndex(item => item.id === old.id)] = task; else next.unshift(task);
  completeRecurrence(task, next);
  if (persist(next)) { announce(old ? "修改已保存。" : "待办已添加。"); resetForm(); render(); }
});
$("#cancel").addEventListener("click", resetForm);
form.elements.repeat.addEventListener("change", syncRepeatFields);
$("#hide-completed").addEventListener("change", event => {
  try {
    localStorage.setItem(HIDE_KEY, JSON.stringify(event.target.checked));
    hideCompleted = event.target.checked;
    render();
  } catch {
    event.target.checked = hideCompleted;
    announce("无法保存隐藏设置，本次设置未更改。");
  }
});
$("#status-filters").addEventListener("click", event => {
  const button = event.target.closest("button[data-status]");
  if (!button) return;
  statusFilter = button.dataset.status;
  $("#status-filters").querySelectorAll("button").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
  render();
});
$("#tag-filter").addEventListener("change", render);
$("#today").textContent = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  if (!Array.isArray(saved) || !saved.every(task => task && typeof task.id === "string" && typeof task.title === "string" && Array.isArray(task.tags) && task.tags.every(tag => typeof tag === "string") && Object.hasOwn(statuses, task.status) && Object.hasOwn(repeats, task.repeat) && typeof task.date === "string" && (!task.date || /^\d{4}-\d{2}-\d{2}$/.test(task.date)) && typeof task.deadline === "string" && (!task.deadline || Number.isFinite(new Date(task.deadline).getTime())))) throw new Error("Invalid saved data");
  if (!saved.every(task => task.repeat !== "custom" || (Number.isInteger(task.repeatInterval) && task.repeatInterval >= 1 && task.repeatInterval <= 999 && Object.hasOwn(repeatUnits, task.repeatUnit)))) throw new Error("Invalid custom rule");
  tasks = saved;
} catch { storageReadable = false; announce("无法读取已保存的数据。请检查浏览器存储设置；原数据不会被覆盖。"); }
try {
  hideCompleted = localStorage.getItem(HIDE_KEY) === "true";
  $("#hide-completed").checked = hideCompleted;
} catch { announce("无法读取隐藏设置，暂时显示全部状态。"); }
syncRepeatFields();
render();

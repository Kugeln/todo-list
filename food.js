"use strict";

(() => {
  const KEY = "rixu.food.v1";
  const types = ["奶茶", "甜点", "炸物", "夜宵", "零食", "其他"];
  const levels = { 1: "低", 2: "中", 3: "高" };
  const form = $("#food-form");
  const dialog = $("#food-dialog");
  let records = [], readable = true, editing = null;
  let selected = localDate(), year = new Date().getFullYear();
  const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "1900-01-01" && value <= "9998-12-31" && Number.isFinite(new Date(`${value}T12:00:00`).getTime()) && localDate(new Date(`${value}T12:00:00`)) === value;
  const valid = record => record && typeof record.id === "string" && typeof record.name === "string" && record.name.trim().length > 0 && record.name.length <= 120 && validDate(record.date) && types.includes(record.type) && Number.isInteger(record.level) && record.level >= 1 && record.level <= 3 && (record.kcal === null || (typeof record.kcal === "number" && Number.isFinite(record.kcal) && record.kcal >= 0 && record.kcal <= 100000)) && typeof record.notes === "string" && record.notes.length <= 1000;
  const message = text => { $("#food-message").textContent = text; };
  function save(next) {
    let error = "";
    if (!readable) error = "原饮食数据无法读取，暂不能保存，以免覆盖原记录。";
    else {
      try { localStorage.setItem(KEY, JSON.stringify(next)); records = next; return true; }
      catch { error = "保存失败，请检查浏览器存储空间和权限。本次修改未保存。"; }
    }
    message(error); $("#food-form-message").textContent = error; return false;
  }
  function selectDate(date) {
    selected = date; year = Number(date.slice(0, 4)); render();
  }
  function openEditor(record) {
    editing = record?.id || null;
    form.reset(); form.elements.date.value = selected;
    if (record) for (const key of ["name", "date", "type", "level", "kcal", "notes"]) form.elements[key].value = record[key] ?? "";
    $("#food-form-heading").textContent = record ? "编辑饮食记录" : "记录饮食";
    $("#food-form-message").textContent = ""; dialog.showModal(); form.elements.name.focus();
  }
  function render() {
    const totals = new Map();
    for (const record of records) {
      const total = totals.get(record.date) || { score: 0, count: 0 };
      total.score += record.level; total.count++; totals.set(record.date, total);
    }
    $("#food-year-label").textContent = `${year} 年`;
    $("#food-prev-year").disabled = year <= 1900;
    $("#food-next-year").disabled = year >= 9998;
    $("#food-selected-date").value = selected;
    $("#food-heatmap").replaceChildren();
    // Monthly blocks keep every day visible on phones without shrinking a 53-week row.
    for (let month = 0; month < 12; month++) {
      const block = element("section", "heat-month");
      block.append(element("h3", "", `${month + 1} 月`));
      const grid = element("div", "heat-days");
      for (const day of ["一", "二", "三", "四", "五", "六", "日"]) grid.append(element("span", "heat-weekday", day));
      const offset = (new Date(year, month, 1).getDay() + 6) % 7;
      for (let i = 0; i < offset; i++) grid.append(element("span", "heat-spacer"));
      const count = new Date(year, month + 1, 0).getDate();
      for (let day = 1; day <= count; day++) {
        const date = localDate(new Date(year, month, day));
        const total = totals.get(date) || { score: 0, count: 0 };
        const intensity = total.score === 0 ? 0 : total.score === 1 ? 1 : total.score <= 3 ? 2 : total.score <= 6 ? 3 : 4;
        const cell = element("button", `heat-day heat-${intensity}`, String(day)); cell.type = "button";
        cell.dataset.date = date;
        cell.setAttribute("aria-label", `${date}，${total.count} 条记录，等级累计 ${total.score} 分`);
        cell.setAttribute("aria-pressed", String(date === selected));
        cell.title = `${date} · ${total.count} 条 · ${total.score} 分`;
        cell.addEventListener("click", () => {
          selectDate(date);
          // Restore keyboard focus after replacing the calendar DOM.
          $("#food-heatmap").querySelector(`button[data-date="${date}"]`)?.focus();
          $("#food-summary").scrollIntoView({ block: "center" });
        });
        grid.append(cell);
      }
      block.append(grid); $("#food-heatmap").append(block);
    }
    const daily = records.filter(record => record.date === selected);
    const estimated = daily.filter(record => record.kcal !== null);
    const kcal = Math.round(estimated.reduce((sum, record) => sum + record.kcal, 0) * 10) / 10;
    $("#food-summary").textContent = `${selected} · ${daily.length} 条记录 · 等级累计 ${totals.get(selected)?.score || 0} 分${estimated.length ? ` · 已填写估算 ${kcal} kcal（${estimated.length}/${daily.length} 条）` : " · 未填写估算热量"}`;
    $("#food-empty").hidden = daily.length > 0;
    $("#food-records").replaceChildren();
    for (const record of daily) {
      const card = element("article", "panel food-record");
      card.append(element("h3", "", record.name));
      card.append(element("p", "metadata", `${record.type} · 热量等级：${levels[record.level]}${record.kcal === null ? "" : ` · 估算 ${record.kcal} kcal`}`));
      if (record.notes) card.append(element("p", "food-notes", record.notes));
      const actions = element("div", "actions");
      const edit = element("button", "", "编辑"); edit.type = "button"; edit.addEventListener("click", () => openEditor(record));
      const remove = element("button", "", "删除"); remove.type = "button";
      remove.addEventListener("click", () => {
        if (confirm(`确定删除“${record.name}”吗？`) && save(records.filter(item => item.id !== record.id))) { message("饮食记录已删除。"); render(); }
      });
      actions.append(edit, remove); card.append(actions); $("#food-records").append(card);
    }
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(form);
    const record = { id: editing || crypto.randomUUID(), name: data.get("name").trim(), date: data.get("date"), type: data.get("type"), level: Number(data.get("level")), kcal: data.get("kcal").trim() === "" ? null : Number(data.get("kcal")), notes: data.get("notes").trim() };
    if (!valid(record)) { $("#food-form-message").textContent = "请填写名称、有效日期和热量等级；估算热量须为 0 至 100000 的数字。"; return; }
    const next = editing ? records.map(item => item.id === editing ? record : item) : [...records, record];
    if (save(next)) { dialog.close(); selectDate(record.date); message(editing ? "饮食记录已修改。" : "饮食记录已添加。"); }
  });
  $("#add-food").addEventListener("click", () => openEditor());
  ["#close-food", "#cancel-food"].forEach(selector => $(selector).addEventListener("click", () => dialog.close()));
  $("#food-selected-date").addEventListener("change", event => {
    if (validDate(event.target.value)) selectDate(event.target.value);
    else { event.target.value = selected; message("请选择有效日期。"); }
  });
  $("#food-today").addEventListener("click", () => selectDate(localDate()));
  $("#food-prev-year").addEventListener("click", () => { if (year > 1900) { year--; render(); } });
  $("#food-next-year").addEventListener("click", () => { if (year < 9998) { year++; render(); } });
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(saved) || !saved.every(valid) || new Set(saved.map(record => record.id)).size !== saved.length) throw Error("Invalid food data");
    records = saved;
  } catch { readable = false; message("无法读取饮食数据，原记录不会被覆盖。其他模块不受影响。"); }
  render();
})();

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard, Car, Wallet, ClipboardList, Search, Plus, X,
  Wrench, Droplets, CheckCircle2, AlertTriangle, TrendingUp,
  Gauge, ChevronDown, Trash2, Edit3, Filter, Save, ArrowUpDown,
  CalendarDays, User, Fuel, ShieldAlert, ParkingCircle, BadgeCheck, LogOut
} from "lucide-react";
import LoginScreen, { isAuthed, logout } from "./LoginScreen.jsx";
import {
  fetchCars, upsertCar, deleteCarRow,
  fetchExpenses, insertExpense, deleteExpenseRow,
  fetchLogs, insertLog, deleteLogRow,
  fetchStaff, addStaffRow, removeStaffRow,
} from "./supabaseClient.js";

/* ---------------------------------------------------------------
   City Rent Car — Fleet Ops
   Учёт автопарка: статусы машин, мойка/ремонт, ежедневные записи
   механиков, расходы по категориям.
----------------------------------------------------------------*/

const STATUS = {
  active: { label: "В работе", color: "#1D9E75", bg: "#E1F5EE", text: "#085041" },
  repair_needed: { label: "Требует ремонта", color: "#EF9F27", bg: "#FAEEDA", text: "#633806" },
  in_repair: { label: "На ремонте", color: "#E24B4A", bg: "#FCEBEB", text: "#791F1F" },
  washing: { label: "На мойке", color: "#378ADD", bg: "#E6F1FB", text: "#0C447C" },
  out_of_service: { label: "Не используется", color: "#888780", bg: "#F1EFE8", text: "#444441" },
};

const EXPENSE_CATEGORIES = {
  fuel: { label: "Топливо", icon: Fuel, color: "#378ADD" },
  repair: { label: "Ремонт", icon: Wrench, color: "#E24B4A" },
  wash: { label: "Мойка", icon: Droplets, color: "#1D9E75" },
  fine: { label: "Штрафы", icon: ShieldAlert, color: "#EF9F27" },
  insurance: { label: "Страховка", icon: BadgeCheck, color: "#7F77DD" },
  parking: { label: "Парковка", icon: ParkingCircle, color: "#D4537E" },
  other: { label: "Прочее", icon: Wallet, color: "#888780" },
};

const STORAGE_KEY = "fleet_data_v1";

const fmtMoney = (n) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n || 0));

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const today = () => new Date().toISOString().slice(0, 10);

const uid = (p = "id") => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const CAR_BRANDS = [
  ["Chevrolet", "Cobalt"], ["Chevrolet", "Nexia"], ["Chevrolet", "Spark"],
  ["Chevrolet", "Gentra"], ["Chevrolet", "Tracker"], ["Chevrolet", "Malibu"],
  ["Hyundai", "Solaris"], ["Hyundai", "Elantra"], ["Hyundai", "Tucson"],
  ["Kia", "Rio"], ["Kia", "Sportage"], ["Kia", "Cerato"],
  ["Toyota", "Camry"], ["Toyota", "Corolla"], ["Toyota", "RAV4"],
  ["Lacetti", "Sedan"], ["Daewoo", "Matiz"], ["Ravon", "R2"],
];

/* ---------------- data hook (Supabase) ---------------- */
function useFleetData() {
  const [data, setDataState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [loadError, setLoadError] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [cars, expenses, logs, staff] = await Promise.all([
        fetchCars(), fetchExpenses(), fetchLogs(), fetchStaff(),
      ]);
      setDataState({
        cars,
        expenses,
        logs,
        staff: staff.length ? staff : ["Менеджер"],
      });
    } catch (e) {
      setLoadError(e.message || "Не удалось подключиться к базе данных");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // setData принимает либо новый объект данных, либо описание точечного действия.
  // Чтобы не переписывать все вью-компоненты, мы сравниваем next с текущим data
  // и сами решаем, какие записи изменились (cars/expenses/logs/staff),
  // и шлём точечные запросы в Supabase.
  const setData = useCallback(async (next) => {
    const prev = data;
    setDataState(next); // оптимистичное обновление UI
    setSaveState("saving");
    try {
      // cars: diff по id
      if (next.cars !== prev.cars) {
        const prevIds = new Set(prev.cars.map((c) => c.id));
        const nextIds = new Set(next.cars.map((c) => c.id));
        for (const id of prevIds) {
          if (!nextIds.has(id)) await deleteCarRow(id);
        }
        for (const car of next.cars) {
          const before = prev.cars.find((c) => c.id === car.id);
          if (!before || JSON.stringify(before) !== JSON.stringify(car)) {
            await upsertCar(car);
          }
        }
      }
      // expenses: только добавление/удаление (без редактирования по месту)
      if (next.expenses !== prev.expenses) {
        const prevIds = new Set(prev.expenses.map((e) => e.id));
        const nextIds = new Set(next.expenses.map((e) => e.id));
        for (const id of prevIds) {
          if (!nextIds.has(id)) await deleteExpenseRow(id);
        }
        for (const exp of next.expenses) {
          if (!prevIds.has(exp.id)) await insertExpense(exp);
        }
      }
      // logs: только добавление/удаление
      if (next.logs !== prev.logs) {
        const prevIds = new Set(prev.logs.map((l) => l.id));
        const nextIds = new Set(next.logs.map((l) => l.id));
        for (const id of prevIds) {
          if (!nextIds.has(id)) await deleteLogRow(id);
        }
        for (const log of next.logs) {
          if (!prevIds.has(log.id)) await insertLog(log);
        }
      }
      // staff: добавление/удаление по имени
      if (next.staff !== prev.staff) {
        const prevSet = new Set(prev.staff);
        const nextSet = new Set(next.staff);
        for (const name of prevSet) {
          if (!nextSet.has(name)) await removeStaffRow(name);
        }
        for (const name of nextSet) {
          if (!prevSet.has(name)) await addStaffRow(name);
        }
      }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1200);
    } catch (e) {
      setSaveState("error");
      // откатываем оптимистичное обновление и подтягиваем актуальные данные с сервера
      await loadAll();
    }
  }, [data, loadAll]);

  return { data, setData, loading, saveState, loadError, reload: loadAll };
}

/* ---------------- small UI atoms ---------------- */
function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.active;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 600,
        background: s.bg,
        color: s.text,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
      {s.label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E7E5DC",
        borderRadius: 14,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#6B6A63" }}>
        <Icon size={16} style={{ color: accent || "#6B6A63" }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#1C1B17", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: "#8A8880" }}>{sub}</div>}
    </div>
  );
}

function Modal({ title, onClose, children, width = 520 }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,18,14,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#FBFAF6",
          borderRadius: 16,
          width: "100%",
          maxWidth: width,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
          border: "1px solid #E7E5DC",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #ECEAE0",
            position: "sticky",
            top: 0,
            background: "#FBFAF6",
            borderRadius: "16px 16px 0 0",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1C1B17" }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: 6,
              borderRadius: 8,
              color: "#6B6A63",
              display: "flex",
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 9,
  border: "1px solid #DEDCD1",
  fontSize: 14,
  background: "#fff",
  color: "#1C1B17",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const labelStyle = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "#6B6A63",
  marginBottom: 5,
  display: "block",
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick, type = "button", style, disabled }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#C9C7BC" : "#1C1B17",
        color: "#fff",
        border: "none",
        borderRadius: 9,
        padding: "10px 16px",
        fontSize: 14,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        color: "#1C1B17",
        border: "1px solid #DEDCD1",
        borderRadius: 9,
        padding: "10px 16px",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard({ data, goTo }) {
  const { cars, expenses, logs } = data;

  const counts = useMemo(() => {
    const c = { active: 0, repair_needed: 0, in_repair: 0, washing: 0, out_of_service: 0 };
    cars.forEach((car) => { c[car.status] = (c[car.status] || 0) + 1; });
    return c;
  }, [cars]);

  const monthExpenses = useMemo(() => {
    const m = today().slice(0, 7);
    return expenses.filter((e) => e.date && e.date.slice(0, 7) === m);
  }, [expenses]);

  const monthTotal = monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);

  const byCategory = useMemo(() => {
    const map = {};
    monthExpenses.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + Number(e.amount || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [monthExpenses]);

  const attention = cars.filter((c) => c.status === "repair_needed" || c.status === "in_repair");

  const recentLogs = [...logs].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 6);

  const maxCat = byCategory.length ? byCategory[0][1] : 0;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 22 }}>
        <StatCard icon={Car} label="Всего машин" value={cars.length} accent="#1C1B17" />
        <StatCard icon={CheckCircle2} label="В работе" value={counts.active} accent="#1D9E75" />
        <StatCard icon={AlertTriangle} label="Требуют ремонта" value={counts.repair_needed} accent="#EF9F27" />
        <StatCard icon={Wrench} label="На ремонте" value={counts.in_repair} accent="#E24B4A" />
        <StatCard icon={Droplets} label="На мойке" value={counts.washing} accent="#378ADD" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16, marginBottom: 22 }}>
        <div style={{ background: "#fff", border: "1px solid #E7E5DC", borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <TrendingUp size={17} color="#1C1B17" />
              <span style={{ fontWeight: 700, fontSize: 15 }}>Расходы за этот месяц</span>
            </div>
            <span style={{ fontSize: 22, fontWeight: 700 }}>{fmtMoney(monthTotal)} <span style={{ fontSize: 13, color: "#8A8880", fontWeight: 600 }}>сум</span></span>
          </div>
          {byCategory.length === 0 ? (
            <div style={{ color: "#8A8880", fontSize: 13.5, padding: "8px 0" }}>Расходов за месяц пока нет.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {byCategory.map(([cat, sum]) => {
                const meta = EXPENSE_CATEGORIES[cat] || EXPENSE_CATEGORIES.other;
                const Icon = meta.icon;
                const pct = maxCat ? Math.max(4, (sum / maxCat) * 100) : 0;
                return (
                  <div key={cat}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#1C1B17", fontWeight: 600 }}>
                        <Icon size={14} style={{ color: meta.color }} /> {meta.label}
                      </span>
                      <span style={{ color: "#6B6A63" }}>{fmtMoney(sum)} сум</span>
                    </div>
                    <div style={{ height: 6, background: "#F1EFE8", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: meta.color, borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <SecondaryButton onClick={() => goTo("expenses")}>Все расходы</SecondaryButton>
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #E7E5DC", borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <AlertTriangle size={17} color="#E24B4A" />
            <span style={{ fontWeight: 700, fontSize: 15 }}>Требуют внимания</span>
          </div>
          {attention.length === 0 ? (
            <div style={{ color: "#8A8880", fontSize: 13.5 }}>Все машины в порядке.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
              {attention.map((car) => (
                <div
                  key={car.id}
                  onClick={() => goTo("cars", car.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    borderRadius: 9,
                    background: "#F8F7F2",
                    cursor: "pointer",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{car.plate}</div>
                    <div style={{ fontSize: 12, color: "#8A8880" }}>{car.make} {car.model}</div>
                  </div>
                  <StatusBadge status={car.status} />
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <SecondaryButton onClick={() => goTo("cars")}>Открыть список машин</SecondaryButton>
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #E7E5DC", borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <ClipboardList size={17} color="#1C1B17" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Последние записи механиков</span>
        </div>
        {recentLogs.length === 0 ? (
          <div style={{ color: "#8A8880", fontSize: 13.5 }}>Записей пока нет — добавьте первую в разделе «Журнал работ».</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recentLogs.map((log) => {
              const car = cars.find((c) => c.id === log.carId);
              return (
                <div key={log.id} style={{ display: "flex", gap: 12, borderBottom: "1px solid #F1EFE8", paddingBottom: 10 }}>
                  <div style={{ fontSize: 12.5, color: "#8A8880", minWidth: 80 }}>{fmtDate(log.date)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {car ? `${car.plate} — ${car.make} ${car.model}` : "Машина удалена"}
                    </div>
                    <div style={{ fontSize: 12.5, color: "#6B6A63" }}>
                      {log.author ? `${log.author} · ` : ""}{log.note || "без комментария"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <SecondaryButton onClick={() => goTo("logs")}>Открыть журнал работ</SecondaryButton>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Cars table ---------------- */
function CarModal({ car, staff, onSave, onClose, onDelete }) {
  const [form, setForm] = useState(
    car || {
      plate: "",
      make: "",
      model: "",
      year: new Date().getFullYear(),
      status: "active",
      mileage: 0,
      lastWashDate: "",
      lastServiceDate: "",
      note: "",
      updatedBy: staff[0] || "",
    }
  );

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal title={car ? `Машина ${car.plate}` : "Добавить машину"} onClose={onClose} width={540}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Госномер">
          <input style={inputStyle} value={form.plate} onChange={(e) => set("plate", e.target.value)} placeholder="01 A123 BC" />
        </Field>
        <Field label="Статус">
          <select style={inputStyle} value={form.status} onChange={(e) => set("status", e.target.value)}>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Марка">
          <input style={inputStyle} value={form.make} onChange={(e) => set("make", e.target.value)} placeholder="Chevrolet" />
        </Field>
        <Field label="Модель">
          <input style={inputStyle} value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="Cobalt" />
        </Field>
        <Field label="Год выпуска">
          <input type="number" style={inputStyle} value={form.year} onChange={(e) => set("year", Number(e.target.value))} />
        </Field>
        <Field label="Пробег, км">
          <input type="number" style={inputStyle} value={form.mileage} onChange={(e) => set("mileage", Number(e.target.value))} />
        </Field>
        <Field label="Дата последней мойки">
          <input type="date" style={inputStyle} value={form.lastWashDate || ""} onChange={(e) => set("lastWashDate", e.target.value)} />
        </Field>
        <Field label="Дата последнего ТО/ремонта">
          <input type="date" style={inputStyle} value={form.lastServiceDate || ""} onChange={(e) => set("lastServiceDate", e.target.value)} />
        </Field>
      </div>
      <Field label="Кто вносит изменение">
        <select style={inputStyle} value={form.updatedBy || ""} onChange={(e) => set("updatedBy", e.target.value)}>
          <option value="">Не указано</option>
          {staff.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Заметка механика">
        <textarea
          style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
          value={form.note || ""}
          onChange={(e) => set("note", e.target.value)}
          placeholder="Например: стук в подвеске, нужна замена тормозных колодок..."
        />
      </Field>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
        {car ? (
          <button
            onClick={() => { if (confirm("Удалить машину из базы?")) onDelete(car.id); }}
            style={{ border: "none", background: "transparent", color: "#A32D2D", fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            <Trash2 size={15} /> Удалить
          </button>
        ) : <span />}
        <div style={{ display: "flex", gap: 10 }}>
          <SecondaryButton onClick={onClose}>Отмена</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              if (!form.plate.trim()) { alert("Укажите госномер"); return; }
              onSave({ ...form, id: car ? car.id : uid("car"), updatedAt: new Date().toISOString() });
            }}
          >
            <Save size={15} /> Сохранить
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

function CarsView({ data, setData, focusCarId, clearFocus }) {
  const { cars, staff } = data;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("plate");
  const [sortDir, setSortDir] = useState(1);
  const [editingCar, setEditingCar] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (focusCarId) {
      const c = cars.find((x) => x.id === focusCarId);
      if (c) setEditingCar(c);
      clearFocus();
    }
  }, [focusCarId]);

  const filtered = useMemo(() => {
    let list = cars;
    if (statusFilter !== "all") list = list.filter((c) => c.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.plate.toLowerCase().includes(q) ||
          c.make.toLowerCase().includes(q) ||
          c.model.toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });
    return list;
  }, [cars, search, statusFilter, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => -d);
    else { setSortKey(key); setSortDir(1); }
  };

  const saveCar = (car) => {
    const exists = cars.some((c) => c.id === car.id);
    const next = exists ? cars.map((c) => (c.id === car.id ? car : c)) : [...cars, car];
    setData({ ...data, cars: next });
    setEditingCar(null);
    setAdding(false);
  };

  const deleteCar = (id) => {
    setData({ ...data, cars: cars.filter((c) => c.id !== id) });
    setEditingCar(null);
  };

  const counts = useMemo(() => {
    const c = { all: cars.length };
    cars.forEach((car) => { c[car.status] = (c[car.status] || 0) + 1; });
    return c;
  }, [cars]);

  const Th = ({ k, children, width }) => (
    <th
      onClick={() => toggleSort(k)}
      style={{
        textAlign: "left",
        padding: "10px 12px",
        fontSize: 12,
        fontWeight: 700,
        color: "#6B6A63",
        textTransform: "uppercase",
        letterSpacing: 0.3,
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        width,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {children}
        {sortKey === k && <ArrowUpDown size={11} />}
      </span>
    </th>
  );

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 220 }}>
          <Search size={15} style={{ position: "absolute", left: 11, top: 10, color: "#9A988F" }} />
          <input
            style={{ ...inputStyle, paddingLeft: 32 }}
            placeholder="Поиск: номер, марка, модель..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select style={{ ...inputStyle, width: 200 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Все статусы ({counts.all})</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label} ({counts[k] || 0})</option>
          ))}
        </select>
        <PrimaryButton onClick={() => setAdding(true)} style={{ marginLeft: "auto" }}>
          <Plus size={15} /> Добавить машину
        </PrimaryButton>
      </div>

      <div style={{ fontSize: 13, color: "#8A8880", marginBottom: 8 }}>
        Показано {filtered.length} из {cars.length}
      </div>

      <div style={{ background: "#fff", border: "1px solid #E7E5DC", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead style={{ background: "#F8F7F2", borderBottom: "1px solid #E7E5DC" }}>
              <tr>
                <Th k="plate">Госномер</Th>
                <Th k="make">Авто</Th>
                <Th k="status">Статус</Th>
                <Th k="mileage">Пробег</Th>
                <Th k="lastWashDate">Мойка</Th>
                <Th k="lastServiceDate">Ремонт/ТО</Th>
                <th style={{ padding: "10px 12px", fontSize: 12, color: "#6B6A63" }}>Заметка</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((car, i) => (
                <tr
                  key={car.id}
                  style={{ borderBottom: "1px solid #F1EFE8", background: i % 2 ? "#FCFBF8" : "#fff", cursor: "pointer" }}
                  onClick={() => setEditingCar(car)}
                >
                  <td style={{ padding: "10px 12px", fontWeight: 700 }}>{car.plate}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 600 }}>{car.make} {car.model}</div>
                    <div style={{ fontSize: 11.5, color: "#9A988F" }}>{car.year} г.</div>
                  </td>
                  <td style={{ padding: "10px 12px" }}><StatusBadge status={car.status} /></td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Gauge size={13} color="#9A988F" /> {fmtMoney(car.mileage)} км
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#6B6A63", whiteSpace: "nowrap" }}>{fmtDate(car.lastWashDate)}</td>
                  <td style={{ padding: "10px 12px", color: "#6B6A63", whiteSpace: "nowrap" }}>{fmtDate(car.lastServiceDate)}</td>
                  <td style={{ padding: "10px 12px", color: "#8A8880", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {car.note || "—"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <Edit3 size={14} color="#9A988F" />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 30, textAlign: "center", color: "#9A988F" }}>Ничего не найдено</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingCar && (
        <CarModal car={editingCar} staff={staff} onClose={() => setEditingCar(null)} onSave={saveCar} onDelete={deleteCar} />
      )}
      {adding && (
        <CarModal car={null} staff={staff} onClose={() => setAdding(false)} onSave={saveCar} onDelete={() => {}} />
      )}
    </div>
  );
}

/* ---------------- Expenses ---------------- */
function ExpenseModal({ cars, staff, onSave, onClose }) {
  const [form, setForm] = useState({
    carId: cars[0]?.id || "",
    date: today(),
    category: "fuel",
    amount: "",
    author: staff[0] || "",
    note: "",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal title="Добавить расход" onClose={onClose} width={480}>
      <Field label="Машина">
        <select style={inputStyle} value={form.carId} onChange={(e) => set("carId", e.target.value)}>
          {cars.map((c) => <option key={c.id} value={c.id}>{c.plate} — {c.make} {c.model}</option>)}
        </select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Дата">
          <input type="date" style={inputStyle} value={form.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field label="Категория">
          <select style={inputStyle} value={form.category} onChange={(e) => set("category", e.target.value)}>
            {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Сумма, сум">
          <input type="number" style={inputStyle} value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" />
        </Field>
        <Field label="Кто внёс">
          <select style={inputStyle} value={form.author} onChange={(e) => set("author", e.target.value)}>
            {staff.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Комментарий">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="Например: замена масла + фильтр" />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
        <SecondaryButton onClick={onClose}>Отмена</SecondaryButton>
        <PrimaryButton
          onClick={() => {
            if (!form.carId) { alert("Выберите машину"); return; }
            if (!form.amount || Number(form.amount) <= 0) { alert("Укажите сумму"); return; }
            onSave({ ...form, id: uid("exp"), amount: Number(form.amount) });
          }}
        >
          <Save size={15} /> Сохранить
        </PrimaryButton>
      </div>
    </Modal>
  );
}

function ExpensesView({ data, setData }) {
  const { cars, expenses, staff } = data;
  const [adding, setAdding] = useState(false);
  const [catFilter, setCatFilter] = useState("all");
  const [carFilter, setCarFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState(today().slice(0, 7));

  const carMap = useMemo(() => Object.fromEntries(cars.map((c) => [c.id, c])), [cars]);

  const filtered = useMemo(() => {
    let list = expenses;
    if (monthFilter) list = list.filter((e) => e.date && e.date.slice(0, 7) === monthFilter);
    if (catFilter !== "all") list = list.filter((e) => e.category === catFilter);
    if (carFilter !== "all") list = list.filter((e) => e.carId === carFilter);
    return [...list].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [expenses, catFilter, carFilter, monthFilter]);

  const total = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);

  const addExpense = (exp) => {
    setData({ ...data, expenses: [...expenses, exp] });
    setAdding(false);
  };

  const deleteExpense = (id) => {
    if (!confirm("Удалить запись о расходе?")) return;
    setData({ ...data, expenses: expenses.filter((e) => e.id !== id) });
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <input type="month" style={{ ...inputStyle, width: 160 }} value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
        <select style={{ ...inputStyle, width: 180 }} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">Все категории</option>
          {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select style={{ ...inputStyle, width: 220 }} value={carFilter} onChange={(e) => setCarFilter(e.target.value)}>
          <option value="all">Все машины</option>
          {cars.map((c) => <option key={c.id} value={c.id}>{c.plate}</option>)}
        </select>
        <PrimaryButton onClick={() => setAdding(true)} style={{ marginLeft: "auto" }}>
          <Plus size={15} /> Добавить расход
        </PrimaryButton>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "#8A8880" }}>Найдено записей: {filtered.length}</span>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Итого: {fmtMoney(total)} сум</span>
      </div>

      <div style={{ background: "#fff", border: "1px solid #E7E5DC", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead style={{ background: "#F8F7F2", borderBottom: "1px solid #E7E5DC" }}>
              <tr>
                {["Дата", "Машина", "Категория", "Сумма", "Кто внёс", "Комментарий", ""].map((h, i) => (
                  <th key={i} style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#6B6A63", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => {
                const car = carMap[e.carId];
                const meta = EXPENSE_CATEGORIES[e.category] || EXPENSE_CATEGORIES.other;
                const Icon = meta.icon;
                return (
                  <tr key={e.id} style={{ borderBottom: "1px solid #F1EFE8", background: i % 2 ? "#FCFBF8" : "#fff" }}>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{fmtDate(e.date)}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>{car ? car.plate : "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Icon size={14} style={{ color: meta.color }} /> {meta.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>{fmtMoney(e.amount)} сум</td>
                    <td style={{ padding: "10px 12px", color: "#6B6A63" }}>{e.author || "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#8A8880", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.note || "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <button onClick={() => deleteExpense(e.id)} aria-label="Удалить" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#C9C7BC", display: "flex" }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 30, textAlign: "center", color: "#9A988F" }}>Нет расходов за выбранный период</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {adding && <ExpenseModal cars={cars} staff={staff} onClose={() => setAdding(false)} onSave={addExpense} />}
    </div>
  );
}

/* ---------------- Daily logs (журнал работ механиков) ---------------- */
function LogModal({ cars, staff, onSave, onClose }) {
  const [form, setForm] = useState({
    carId: cars[0]?.id || "",
    date: today(),
    author: staff[0] || "",
    mileage: cars[0]?.mileage || "",
    washed: false,
    statusChange: "",
    note: "",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const car = cars.find((c) => c.id === form.carId);

  useEffect(() => {
    if (car) set("mileage", car.mileage);
  }, [form.carId]);

  return (
    <Modal title="Запись в журнал работ" onClose={onClose} width={520}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Машина">
          <select style={inputStyle} value={form.carId} onChange={(e) => set("carId", e.target.value)}>
            {cars.map((c) => <option key={c.id} value={c.id}>{c.plate} — {c.make} {c.model}</option>)}
          </select>
        </Field>
        <Field label="Дата">
          <input type="date" style={inputStyle} value={form.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Кто вносит запись">
          <select style={inputStyle} value={form.author} onChange={(e) => set("author", e.target.value)}>
            {staff.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Текущий пробег, км">
          <input type="number" style={inputStyle} value={form.mileage} onChange={(e) => set("mileage", Number(e.target.value))} />
        </Field>
      </div>

      <Field label="Мойка">
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={form.washed} onChange={(e) => set("washed", e.target.checked)} style={{ width: 16, height: 16 }} />
          Машина была вымыта в этот день
        </label>
      </Field>

      <Field label="Изменить статус машины (необязательно)">
        <select style={inputStyle} value={form.statusChange} onChange={(e) => set("statusChange", e.target.value)}>
          <option value="">Оставить текущий статус ({car ? STATUS[car.status]?.label : "—"})</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </Field>

      <Field label="Комментарий механика">
        <textarea
          style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
          placeholder="Что сделано, что обнаружено, что нужно сделать дальше..."
        />
      </Field>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
        <SecondaryButton onClick={onClose}>Отмена</SecondaryButton>
        <PrimaryButton onClick={() => {
          if (!form.carId) { alert("Выберите машину"); return; }
          onSave({ ...form, id: uid("log"), createdAt: new Date().toISOString() });
        }}>
          <Save size={15} /> Сохранить запись
        </PrimaryButton>
      </div>
    </Modal>
  );
}

function LogsView({ data, setData }) {
  const { cars, logs, staff } = data;
  const [adding, setAdding] = useState(false);
  const [carFilter, setCarFilter] = useState("all");

  const carMap = useMemo(() => Object.fromEntries(cars.map((c) => [c.id, c])), [cars]);

  const filtered = useMemo(() => {
    let list = logs;
    if (carFilter !== "all") list = list.filter((l) => l.carId === carFilter);
    return [...list].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [logs, carFilter]);

  const addLog = (log) => {
    const next = { ...data, logs: [...logs, log] };
    const car = cars.find((c) => c.id === log.carId);
    if (car) {
      const updatedCar = {
        ...car,
        mileage: log.mileage || car.mileage,
        lastWashDate: log.washed ? log.date : car.lastWashDate,
        status: log.statusChange || car.status,
        lastServiceDate: log.statusChange === "in_repair" || log.statusChange === "active" ? (car.status === "in_repair" ? log.date : car.lastServiceDate) : car.lastServiceDate,
        note: log.note ? log.note : car.note,
        updatedBy: log.author,
        updatedAt: new Date().toISOString(),
      };
      next.cars = cars.map((c) => (c.id === car.id ? updatedCar : c));
    }
    setData(next);
    setAdding(false);
  };

  const deleteLog = (id) => {
    if (!confirm("Удалить запись из журнала?")) return;
    setData({ ...data, logs: logs.filter((l) => l.id !== id) });
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <select style={{ ...inputStyle, width: 240 }} value={carFilter} onChange={(e) => setCarFilter(e.target.value)}>
          <option value="all">Все машины</option>
          {cars.map((c) => <option key={c.id} value={c.id}>{c.plate}</option>)}
        </select>
        <span style={{ fontSize: 13, color: "#8A8880" }}>Записей: {filtered.length}</span>
        <PrimaryButton onClick={() => setAdding(true)} style={{ marginLeft: "auto" }}>
          <Plus size={15} /> Новая запись
        </PrimaryButton>
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #E7E5DC", borderRadius: 14, padding: 40, textAlign: "center", color: "#9A988F" }}>
          Записей пока нет. Добавляйте ежедневные отметки механиков о пробеге, мойке и состоянии машин.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((log) => {
            const car = carMap[log.carId];
            return (
              <div key={log.id} style={{ background: "#fff", border: "1px solid #E7E5DC", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{car ? car.plate : "Машина удалена"}</span>
                    {car && <span style={{ color: "#8A8880", fontSize: 13 }}>{car.make} {car.model}</span>}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "#6B6A63" }}>
                      <CalendarDays size={13} /> {fmtDate(log.date)}
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "#6B6A63" }}>
                      <User size={13} /> {log.author || "—"}
                    </span>
                  </div>
                  <button onClick={() => deleteLog(log.id)} aria-label="Удалить" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#C9C7BC", display: "flex" }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap", fontSize: 13 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Gauge size={13} color="#9A988F" /> {fmtMoney(log.mileage)} км
                  </span>
                  {log.washed && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#0C447C" }}>
                      <Droplets size={13} /> Мойка выполнена
                    </span>
                  )}
                  {log.statusChange && <StatusBadge status={log.statusChange} />}
                </div>
                {log.note && <div style={{ marginTop: 8, fontSize: 13.5, color: "#444441", lineHeight: 1.5 }}>{log.note}</div>}
              </div>
            );
          })}
        </div>
      )}

      {adding && <LogModal cars={cars} staff={staff} onClose={() => setAdding(false)} onSave={addLog} />}
    </div>
  );
}

/* ---------------- Staff settings (mini) ---------------- */
function StaffBar({ data, setData }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { staff } = data;

  return (
    <div style={{ position: "relative" }}>
      <SecondaryButton onClick={() => setOpen((o) => !o)}>
        <User size={14} /> Сотрудники <ChevronDown size={13} />
      </SecondaryButton>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#fff", border: "1px solid #E7E5DC", borderRadius: 12, padding: 14, width: 260, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 20 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#6B6A63", marginBottom: 8 }}>Список сотрудников</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10, maxHeight: 160, overflowY: "auto" }}>
            {staff.map((s) => (
              <div key={s} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5 }}>
                <span>{s}</span>
                <button
                  onClick={() => setData({ ...data, staff: staff.filter((x) => x !== s) })}
                  aria-label="Удалить сотрудника"
                  style={{ border: "none", background: "transparent", cursor: "pointer", color: "#C9C7BC", display: "flex" }}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              style={{ ...inputStyle, padding: "6px 10px", fontSize: 13 }}
              placeholder="Имя сотрудника"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  setData({ ...data, staff: [...staff, name.trim()] });
                  setName("");
                }
              }}
            />
            <button
              onClick={() => {
                if (name.trim()) {
                  setData({ ...data, staff: [...staff, name.trim()] });
                  setName("");
                }
              }}
              style={{ border: "1px solid #DEDCD1", background: "#fff", borderRadius: 8, padding: "0 10px", cursor: "pointer" }}
              aria-label="Добавить сотрудника"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- App shell ---------------- */
export default function App() {
  const [authed, setAuthedState] = useState(isAuthed());

  if (!authed) {
    return <LoginScreen onSuccess={() => setAuthedState(true)} />;
  }

  return <FleetApp onLogout={() => { logout(); setAuthedState(false); }} />;
}

function FleetApp({ onLogout }) {
  const { data, setData, loading, saveState, loadError, reload } = useFleetData();
  const [tab, setTab] = useState("dashboard");
  const [focusCarId, setFocusCarId] = useState(null);

  const goTo = (t, carId) => {
    setTab(t);
    if (carId) setFocusCarId(carId);
  };

  if (loadError) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14, background: "#F4F2EB", fontFamily: "system-ui, sans-serif", padding: 20, textAlign: "center" }}>
        <AlertTriangle size={28} color="#A32D2D" />
        <div style={{ fontWeight: 700, fontSize: 16 }}>Не удалось подключиться к базе данных</div>
        <div style={{ color: "#6B6A63", fontSize: 13.5, maxWidth: 420 }}>{loadError}</div>
        <div style={{ color: "#8A8880", fontSize: 12.5, maxWidth: 420 }}>
          Проверьте, что переменные VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY заданы верно, и что таблицы созданы в Supabase (см. файл supabase_schema.sql).
        </div>
        <SecondaryButton onClick={reload}>Повторить попытку</SecondaryButton>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8A8880", fontFamily: "system-ui, -apple-system, sans-serif", background: "#F4F2EB" }}>
        Загрузка данных автопарка...
      </div>
    );
  }

  const NAV = [
    { key: "dashboard", label: "Дашборд", icon: LayoutDashboard },
    { key: "cars", label: "Машины", icon: Car },
    { key: "expenses", label: "Расходы", icon: Wallet },
    { key: "logs", label: "Журнал работ", icon: ClipboardList },
  ];

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", background: "#F4F2EB", minHeight: "100vh", color: "#1C1B17" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: "#1C1B17", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Car size={18} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.1 }}>City Rent Car</div>
                <div style={{ fontSize: 12.5, color: "#8A8880" }}>Учёт автопарка и работ механиков</div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: saveState === "error" ? "#A32D2D" : "#8A8880", minWidth: 90, textAlign: "right" }}>
              {saveState === "saving" && "Сохранение..."}
              {saveState === "saved" && "✓ Сохранено"}
              {saveState === "error" && "Ошибка сохранения"}
            </span>
            <StaffBar data={data} setData={setData} />
            <button
              onClick={onLogout}
              aria-label="Выйти"
              title="Выйти"
              style={{ border: "1px solid #DEDCD1", background: "#fff", borderRadius: 9, padding: "9px 10px", cursor: "pointer", display: "flex", color: "#6B6A63" }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 22, borderBottom: "1px solid #E7E5DC", flexWrap: "wrap" }}>
          {NAV.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                border: "none",
                background: "transparent",
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                color: tab === key ? "#1C1B17" : "#8A8880",
                borderBottom: tab === key ? "2px solid #1C1B17" : "2px solid transparent",
                marginBottom: -1,
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {tab === "dashboard" && <Dashboard data={data} goTo={goTo} />}
        {tab === "cars" && <CarsView data={data} setData={setData} focusCarId={focusCarId} clearFocus={() => setFocusCarId(null)} />}
        {tab === "expenses" && <ExpensesView data={data} setData={setData} />}
        {tab === "logs" && <LogsView data={data} setData={setData} />}
      </div>
    </div>
  );
}

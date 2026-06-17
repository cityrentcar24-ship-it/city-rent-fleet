import { createClient } from "@supabase/supabase-js";

// Эти два значения нужно вставить из вашего проекта Supabase.
// Settings -> API -> Project URL и anon public key.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ----------------------- CARS ----------------------- */

export async function fetchCars() {
  const { data, error } = await supabase.from("cars").select("*").order("plate");
  if (error) throw error;
  return data.map(rowToCar);
}

export async function upsertCar(car) {
  const row = carToRow(car);
  const { data, error } = await supabase.from("cars").upsert(row).select().single();
  if (error) throw error;
  return rowToCar(data);
}

export async function deleteCarRow(id) {
  const { error } = await supabase.from("cars").delete().eq("id", id);
  if (error) throw error;
}

function rowToCar(r) {
  return {
    id: r.id,
    plate: r.plate,
    make: r.make,
    model: r.model,
    year: r.year,
    status: r.status,
    mileage: r.mileage,
    lastWashDate: r.last_wash_date || "",
    lastServiceDate: r.last_service_date || "",
    note: r.note || "",
    updatedBy: r.updated_by || "",
    updatedAt: r.updated_at || "",
  };
}

function carToRow(c) {
  return {
    id: c.id,
    plate: c.plate,
    make: c.make,
    model: c.model,
    year: c.year,
    status: c.status,
    mileage: c.mileage,
    last_wash_date: c.lastWashDate || null,
    last_service_date: c.lastServiceDate || null,
    note: c.note || "",
    updated_by: c.updatedBy || "",
    updated_at: c.updatedAt || new Date().toISOString(),
  };
}

/* ----------------------- EXPENSES ----------------------- */

export async function fetchExpenses() {
  const { data, error } = await supabase.from("expenses").select("*").order("date", { ascending: false });
  if (error) throw error;
  return data.map(rowToExpense);
}

export async function insertExpense(exp) {
  const row = expenseToRow(exp);
  const { data, error } = await supabase.from("expenses").insert(row).select().single();
  if (error) throw error;
  return rowToExpense(data);
}

export async function deleteExpenseRow(id) {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}

function rowToExpense(r) {
  return {
    id: r.id,
    carId: r.car_id,
    date: r.date,
    category: r.category,
    amount: r.amount,
    author: r.author || "",
    note: r.note || "",
  };
}

function expenseToRow(e) {
  return {
    id: e.id,
    car_id: e.carId,
    date: e.date,
    category: e.category,
    amount: e.amount,
    author: e.author || "",
    note: e.note || "",
  };
}

/* ----------------------- LOGS ----------------------- */

export async function fetchLogs() {
  const { data, error } = await supabase.from("logs").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(rowToLog);
}

export async function insertLog(log) {
  const row = logToRow(log);
  const { data, error } = await supabase.from("logs").insert(row).select().single();
  if (error) throw error;
  return rowToLog(data);
}

export async function deleteLogRow(id) {
  const { error } = await supabase.from("logs").delete().eq("id", id);
  if (error) throw error;
}

function rowToLog(r) {
  return {
    id: r.id,
    carId: r.car_id,
    date: r.date,
    author: r.author || "",
    mileage: r.mileage,
    washed: r.washed,
    statusChange: r.status_change || "",
    note: r.note || "",
    createdAt: r.created_at,
  };
}

function logToRow(l) {
  return {
    id: l.id,
    car_id: l.carId,
    date: l.date,
    author: l.author || "",
    mileage: l.mileage,
    washed: !!l.washed,
    status_change: l.statusChange || null,
    note: l.note || "",
    created_at: l.createdAt || new Date().toISOString(),
  };
}

/* ----------------------- STAFF ----------------------- */

export async function fetchStaff() {
  const { data, error } = await supabase.from("staff").select("*").order("name");
  if (error) throw error;
  return data.map((r) => r.name);
}

export async function addStaffRow(name) {
  const { error } = await supabase.from("staff").insert({ name });
  if (error) throw error;
}

export async function removeStaffRow(name) {
  const { error } = await supabase.from("staff").delete().eq("name", name);
  if (error) throw error;
}

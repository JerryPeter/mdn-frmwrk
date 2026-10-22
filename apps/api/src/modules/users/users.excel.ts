import ExcelJS from 'exceljs';
import { prisma } from '../../config/db.js';
import { generatePassword, hashPassword, passwordPolicyViolations } from '../../lib/password.js';
import { AppError, validationError, type ErrorDetail } from '../../utils/errors.js';
import { createUserSchema } from './users.schema.js';
import { findDuplicates, usersService } from './users.service.js';
import type { UserFilter } from './users.schema.js';

const XLSX_HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = XLSX_HEADER_FILL;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

const toBuffer = async (wb: ExcelJS.Workbook) => Buffer.from(await wb.xlsx.writeBuffer());

/** Export Excel daftar user (PRD §8.9): kolom sesuai PRD, mengikuti filter list */
export async function exportUsers(filter: UserFilter) {
  const rows = await usersService.exportRows(filter);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MODENA Framework';
  const sheet = wb.addWorksheet('Users');
  sheet.columns = [
    { header: 'username', key: 'username', width: 22 },
    { header: 'full_name', key: 'full_name', width: 30 },
    { header: 'email', key: 'email', width: 32 },
    { header: 'employee_no', key: 'employee_no', width: 14 },
    { header: 'auth_provider', key: 'auth_provider', width: 14 },
    { header: 'is_active', key: 'is_active', width: 10 },
    { header: 'is_locked', key: 'is_locked', width: 10 },
    { header: 'last_login_at', key: 'last_login_at', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
  ];
  rows.forEach((r) => sheet.addRow(r));
  styleHeader(sheet);
  sheet.autoFilter = { from: 'A1', to: 'H1' };
  return toBuffer(wb);
}

// ---------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------
export const IMPORT_COLUMNS = ['username', 'email', 'full_name', 'employee_no', 'phone', 'password'] as const;
type ImportColumn = (typeof IMPORT_COLUMNS)[number];
const REQUIRED_COLUMNS: ImportColumn[] = ['username', 'email', 'full_name'];
export const IMPORT_MAX_ROWS = 1000;

/** Template import: sheet "Users" (hanya header) + sheet "Petunjuk" */
export async function importTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MODENA Framework';
  const sheet = wb.addWorksheet('Users');
  sheet.columns = [
    { header: 'username', key: 'username', width: 22 },
    { header: 'email', key: 'email', width: 32 },
    { header: 'full_name', key: 'full_name', width: 30 },
    { header: 'employee_no', key: 'employee_no', width: 14 },
    { header: 'phone', key: 'phone', width: 16 },
    { header: 'password', key: 'password', width: 18 },
  ];
  // Teks agar Excel tidak mengubah nomor karyawan/telepon menjadi angka
  ['D', 'E', 'F'].forEach((col) => (sheet.getColumn(col).numFmt = '@'));
  styleHeader(sheet);

  const help = wb.addWorksheet('Petunjuk');
  help.columns = [
    { header: 'Kolom', key: 'col', width: 16 },
    { header: 'Wajib', key: 'req', width: 8 },
    { header: 'Keterangan', key: 'desc', width: 90 },
  ];
  help.addRows([
    { col: 'username', req: 'Ya', desc: '3–100 karakter: huruf kecil, angka, titik, underscore. Unik.' },
    { col: 'email', req: 'Ya', desc: 'Format email valid, maksimal 150 karakter. Unik.' },
    { col: 'full_name', req: 'Ya', desc: 'Nama lengkap, maksimal 200 karakter.' },
    { col: 'employee_no', req: 'Tidak', desc: 'Nomor induk karyawan, maksimal 30 karakter.' },
    { col: 'phone', req: 'Tidak', desc: 'Nomor telepon, maksimal 30 karakter.' },
    {
      col: 'password',
      req: 'Tidak',
      desc: 'Password awal (min. 8 karakter, huruf besar, huruf kecil, angka, simbol). Kosongkan agar dibangkitkan otomatis.',
    },
    { col: '', req: '', desc: '' },
    { col: 'Catatan', req: '', desc: `Isi data mulai baris 2 sheet "Users". Maksimal ${IMPORT_MAX_ROWS} baris per file.` },
    { col: '', req: '', desc: 'Semua user hasil import memakai auth provider LOCAL dan wajib mengganti password saat login pertama.' },
    { col: '', req: '', desc: 'Import bersifat all-or-nothing: bila ada satu baris tidak valid, tidak ada data yang disimpan.' },
  ]);
  styleHeader(help);
  return toBuffer(wb);
}

const importError = (message: string) => new AppError(400, 'VALIDATION_ERROR', message, [{ field: 'file', message }]);

interface ParsedRow {
  row: number;
  values: Partial<Record<ImportColumn, string>>;
}

async function readRows(buffer: Buffer): Promise<ParsedRow[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw importError('File tidak dapat dibaca. Gunakan file Excel (.xlsx) dari template.');
  }
  const sheet = wb.getWorksheet('Users') ?? wb.worksheets[0];
  if (!sheet) throw importError('File tidak berisi sheet data.');

  // Peta kolom dari header baris 1 (urutan kolom bebas)
  const columns = new Map<number, ImportColumn>();
  sheet.getRow(1).eachCell((cell, col) => {
    const name = cell.text.trim().toLowerCase();
    if ((IMPORT_COLUMNS as readonly string[]).includes(name)) columns.set(col, name as ImportColumn);
  });
  const missing = REQUIRED_COLUMNS.filter((c) => ![...columns.values()].includes(c));
  if (missing.length) throw importError(`Kolom wajib tidak ditemukan di header: ${missing.join(', ')}.`);

  const rows: ParsedRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: ParsedRow['values'] = {};
    // cell.text: nilai tampilan, termasuk email yang otomatis menjadi hyperlink
    columns.forEach((name, col) => {
      const text = row.getCell(col).text.trim();
      if (text) values[name] = text;
    });
    if (Object.keys(values).length) rows.push({ row: rowNumber, values });
  });
  if (!rows.length) throw importError('File tidak berisi data user (isi mulai baris 2).');
  if (rows.length > IMPORT_MAX_ROWS) throw importError(`Maksimal ${IMPORT_MAX_ROWS} baris per file (file berisi ${rows.length} baris).`);
  return rows;
}

/**
 * Import user (PRD §8.9 [U]): validasi seluruh baris (format, kebijakan password, duplikat di file
 * maupun di database), lalu simpan dalam satu transaksi hanya bila semua baris valid.
 * Error per baris dikembalikan dengan `field` = "<nomor baris>.<kolom>".
 */
export async function importUsers(buffer: Buffer, actor: string) {
  const rows = await readRows(buffer);
  const errors: ErrorDetail[] = [];
  const parsed: Array<{ row: number; data: ReturnType<typeof createUserSchema.parse> }> = [];
  const seen = { username: new Map<string, number>(), email: new Map<string, number>() };

  for (const { row, values } of rows) {
    const result = createUserSchema.safeParse({ ...values, auth_provider: 'LOCAL' });
    if (!result.success) {
      result.error.issues.forEach((i) => errors.push({ field: `${row}.${i.path.join('.')}`, message: i.message }));
      continue;
    }
    const data = result.data;
    if (data.password) {
      passwordPolicyViolations(data.password).forEach((message) => errors.push({ field: `${row}.password`, message }));
    }
    for (const key of ['username', 'email'] as const) {
      const firstRow = seen[key].get(data[key]);
      if (firstRow) errors.push({ field: `${row}.${key}`, message: `${data[key]} duplikat dengan baris ${firstRow}` });
      else seen[key].set(data[key], row);
    }
    parsed.push({ row, data });
  }

  // Duplikat terhadap user yang sudah ada di database (semua baris yang formatnya valid)
  for (const { row, data } of parsed) {
    (await findDuplicates({ username: data.username, email: data.email })).forEach((d) =>
      errors.push({ field: `${row}.${d.field}`, message: d.message }),
    );
  }

  if (errors.length) {
    const badRows = new Set(errors.map((e) => e.field.split('.')[0])).size;
    errors.sort((a, b) => parseInt(a.field, 10) - parseInt(b.field, 10));
    throw validationError(errors, `Import dibatalkan: ${badRows} dari ${rows.length} baris tidak valid. Tidak ada data yang disimpan.`);
  }

  const prepared = await Promise.all(
    parsed.map(async ({ data }) => {
      const plain = data.password ?? generatePassword();
      return { data, plain, hash: await hashPassword(plain) };
    }),
  );
  const now = new Date();
  await prisma.$transaction(
    prepared.map(({ data: { password: _password, ...fields }, hash }) =>
      prisma.users.create({
        data: {
          ...fields,
          password_hash: hash,
          password_changed_at: now,
          must_change_password: true,
          created_by: actor,
        },
        select: { id: true },
      }),
    ),
  );

  return {
    imported: prepared.length,
    // Password bangkitan ditampilkan sekali agar dapat dibagikan ke user
    users: prepared.map(({ data, plain }) => ({
      username: data.username,
      email: data.email,
      full_name: data.full_name,
      generated_password: data.password ? null : plain,
    })),
  };
}

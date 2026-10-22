import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { toApiError, type ApiError } from '@/api/errors';
import { usersApi } from '@/api/users';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/stores/toast';
import type { ImportResult } from '@/types/user';

const MAX_BYTES = 2 * 1024 * 1024;

const COLUMN_LABEL: Record<string, string> = {
  username: 'username',
  email: 'email',
  full_name: 'full_name',
  employee_no: 'employee_no',
  phone: 'phone',
  password: 'password',
};

/** Detail error import berformat "<baris>.<kolom>" */
function rowErrors(err: ApiError) {
  return err.details
    .map((d) => {
      const m = /^(\d+)\.(.+)$/.exec(d.field);
      return m ? { row: Number(m[1]), column: COLUMN_LABEL[m[2]] ?? m[2], message: d.message } : null;
    })
    .filter((x): x is { row: number; column: string; message: string } => x !== null);
}

/** Simpan hasil import (termasuk password bangkitan) sebagai CSV untuk dibagikan */
function downloadCredentials(result: ImportResult) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    'username,email,full_name,password_sementara',
    ...result.users.map((u) => [u.username, u.email, u.full_name, u.generated_password ?? '(ditentukan di file)'].map(esc).join(',')),
  ];
  const url = URL.createObjectURL(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hasil_import_users.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: (result: ImportResult) => void;
}

/** Import Excel user (PRD §8.9 [U]): all-or-nothing, error ditampilkan per baris */
export function ImportUsersModal({ open, onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setFile(null);
      setFileError(null);
      setError(null);
      setResult(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: (f: File) => usersApi.importExcel(f),
    onSuccess: (res) => {
      setResult(res);
      onImported(res);
    },
    onError: (err) => setError(toApiError(err)),
  });

  const pick = (f: File | null) => {
    setError(null);
    setFileError(null);
    if (f && !/\.xlsx$/i.test(f.name)) return setFileError('File harus berformat .xlsx');
    if (f && f.size > MAX_BYTES) return setFileError('Ukuran file maksimal 2 MB');
    setFile(f);
  };

  const template = async () => {
    setTemplateLoading(true);
    try {
      await usersApi.downloadTemplate();
    } catch (err) {
      toast.error(toApiError(err).message);
    } finally {
      setTemplateLoading(false);
    }
  };

  const errors = error ? rowErrors(error) : [];
  const generated = result?.users.filter((u) => u.generated_password).length ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={mutation.isPending}
      wide
      title={result ? 'Import selesai' : 'Import User dari Excel'}
      description={
        result ? (
          <>{result.imported} user berhasil dibuat. Semua user wajib mengganti password saat login pertama.</>
        ) : (
          <>Validasi dilakukan untuk seluruh baris terlebih dahulu. Data hanya disimpan bila semua baris valid.</>
        )
      }
      footer={
        result ? (
          <>
            <Button variant="secondary" onClick={() => downloadCredentials(result)}>
              <Download className="h-4 w-4" /> Unduh hasil (CSV)
            </Button>
            <Button onClick={onClose}>Selesai</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
              Batal
            </Button>
            <Button onClick={() => file && mutation.mutate(file)} disabled={!file} loading={mutation.isPending}>
              <Upload className="h-4 w-4" /> Import
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="mt-4 space-y-3">
          {generated > 0 && (
            <Alert variant="warning">
              {generated} password dibangkitkan sistem dan hanya ditampilkan sekali. Unduh hasil sebelum menutup dialog ini.
            </Alert>
          )}
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm" aria-label="Hasil import">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Username</th>
                  <th className="px-3 py-2 text-left font-semibold">Nama</th>
                  <th className="px-3 py-2 text-left font-semibold">Password sementara</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.users.map((u) => (
                  <tr key={u.username}>
                    <td className="px-3 py-2 font-mono text-xs">{u.username}</td>
                    <td className="px-3 py-2">{u.full_name}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {u.generated_password ?? <span className="font-sans text-slate-400">ditentukan di file</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm">
            <span className="text-slate-600">Gunakan template agar kolom sesuai (petunjuk ada di sheet "Petunjuk").</span>
            <Button variant="secondary" size="sm" onClick={template} loading={templateLoading}>
              <Download className="h-4 w-4" /> Template
            </Button>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files[0] ?? null);
            }}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-4 py-8 text-center"
          >
            <FileSpreadsheet className="h-9 w-9 text-slate-400" />
            {file ? (
              <p className="mt-2 text-sm font-medium text-slate-800">
                {file.name} <span className="font-normal text-slate-500">({Math.ceil(file.size / 1024)} KB)</span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Tarik file .xlsx ke sini, atau</p>
            )}
            <Button variant="ghost" size="sm" className="mt-1" onClick={() => inputRef.current?.click()}>
              {file ? 'Ganti file' : 'Pilih file'}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              aria-label="File import"
              onChange={(e) => {
                pick(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            <p className="mt-1 text-xs text-slate-400">Maksimal 2 MB, 1.000 baris</p>
          </div>

          {fileError && <Alert variant="error">{fileError}</Alert>}

          {error && <Alert variant="error">{error.message}</Alert>}

          {errors.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-red-200">
              <table className="min-w-full text-sm" aria-label="Error import">
                <thead className="sticky top-0 bg-red-50 text-xs uppercase tracking-wide text-red-700">
                  <tr>
                    <th className="w-16 px-3 py-2 text-left font-semibold">Baris</th>
                    <th className="w-32 px-3 py-2 text-left font-semibold">Kolom</th>
                    <th className="px-3 py-2 text-left font-semibold">Pesan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100">
                  {errors.map((e, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-mono text-xs">{e.row}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{e.column}</td>
                      <td className="px-3 py-1.5 text-slate-700">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface Props {
  open: boolean;
  title: string;
  username: string;
  password: string;
  onClose: () => void;
}

/** Password bangkitan sistem ditampilkan sekali (PRD §8.9); setelah ditutup tidak dapat dilihat lagi */
export function PasswordRevealModal({ open, title, username, password, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard tidak tersedia: admin tetap dapat menyalin manual */
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={
        <>
          Password sementara untuk <span className="font-medium text-slate-800">{username}</span>. User wajib menggantinya saat login pertama.
        </>
      }
      footer={<Button onClick={onClose}>Saya sudah menyimpannya</Button>}
    >
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <KeyRound className="h-4 w-4 shrink-0 text-slate-400" />
        <code data-testid="generated-password" className="flex-1 select-all font-mono text-base tracking-wide text-slate-900">
          {password}
        </code>
        <Button variant="secondary" size="sm" onClick={copy}>
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Tersalin' : 'Salin'}
        </Button>
      </div>
      <div className="mt-4">
        <Alert variant="warning">Password ini hanya ditampilkan sekali. Sampaikan ke user melalui saluran yang aman.</Alert>
      </div>
    </Modal>
  );
}

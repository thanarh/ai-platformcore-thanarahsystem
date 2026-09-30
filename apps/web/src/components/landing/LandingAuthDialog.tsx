'use client';

import { useEffect, useRef } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';
import { RegisterForm } from '@/components/auth/RegisterForm';
import styles from './thanarah-landing.module.css';

export type LandingAuthMode = 'login' | 'register';

export function LandingAuthDialog({
  mode,
  onModeChange,
  onClose,
}: {
  mode: LandingAuthMode | null;
  onModeChange: (mode: LandingAuthMode) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (mode && !dialog.open) {
      dialog.showModal();
    } else if (!mode && dialog.open) {
      dialog.close();
    }
  }, [mode]);

  const isRegister = mode === 'register';

  return (
    <dialog
      ref={dialogRef}
      id="landing-auth-dialog"
      className={styles.authDialog}
      dir="rtl"
      aria-labelledby="landing-auth-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {mode && (
        <div className={styles.authDialogContent}>
          <div className={styles.authDialogHeader}>
            <div>
              <span className={styles.kicker}>ثنارة للذكاء الاصطناعي</span>
              <h2 id="landing-auth-title">{isRegister ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}</h2>
              <p>
                {isRegister ? 'ابدأ تجربتك مع ثنارة AI' : 'مرحباً بك مجدداً في ثنارة AI'}
              </p>
            </div>
            <button
              type="button"
              className={styles.authCloseButton}
              onClick={onClose}
              aria-label="إغلاق النافذة"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className={styles.authFormCard}>
            {isRegister ? <RegisterForm /> : <LoginForm />}
          </div>

          <p className={styles.authModeSwitch}>
            {isRegister ? 'لديك حساب بالفعل؟' : 'ليس لديك حساب؟'}
            <button
              type="button"
              onClick={() => onModeChange(isRegister ? 'login' : 'register')}
            >
              {isRegister ? 'تسجيل الدخول' : 'إنشاء حساب'}
            </button>
          </p>
        </div>
      )}
    </dialog>
  );
}
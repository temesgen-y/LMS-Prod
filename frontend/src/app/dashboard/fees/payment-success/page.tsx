'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function PaymentSuccessPage() {
  const params = useSearchParams();
  const router = useRouter();
  const txRef = params.get('tx_ref');

  const [status, setStatus] = useState<'loading' | 'success' | 'failed' | 'error'>('loading');
  const [amount, setAmount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!txRef) { router.replace('/dashboard/fees'); return; }

    const verify = async () => {
      try {
        const res = await fetch(`/api/payments/chapa/verify?tx_ref=${encodeURIComponent(txRef)}`);
        const data = await res.json();
        if (!res.ok) { setStatus('error'); setErrorMsg(data.error ?? 'Verification failed'); return; }
        setStatus(data.status === 'success' ? 'success' : 'failed');
        if (data.amount) setAmount(data.amount);
      } catch (e: any) {
        setStatus('error');
        setErrorMsg(e.message ?? 'Network error');
      }
    };

    verify();
  }, [txRef, router]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-8 text-center space-y-5">
        {status === 'loading' && (
          <>
            <div className="mx-auto w-12 h-12 rounded-full border-4 border-purple-200 border-t-purple-600 animate-spin" />
            <p className="text-gray-600 font-medium">Verifying your payment...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Payment Successful</h1>
            {amount !== null && (
              <p className="text-gray-600">ETB <span className="font-semibold text-gray-900">{amount.toLocaleString()}</span> paid successfully.</p>
            )}
            <p className="text-sm text-gray-500">Your fee account has been updated. You will receive a confirmation shortly.</p>
            <Link
              href="/dashboard/fees"
              className="inline-block mt-2 px-6 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-sm font-medium"
            >
              View Fee Account
            </Link>
          </>
        )}

        {status === 'failed' && (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Payment Failed</h1>
            <p className="text-sm text-gray-500">Your payment was not completed. No amount was charged. Please try again or contact the Registrar Office.</p>
            <Link
              href="/dashboard/fees"
              className="inline-block mt-2 px-6 py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-sm font-medium"
            >
              Back to Fee Account
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Verification Error</h1>
            <p className="text-sm text-gray-500">{errorMsg || 'Could not verify payment status. Please contact the Registrar Office.'}</p>
            <Link
              href="/dashboard/fees"
              className="inline-block mt-2 px-6 py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-sm font-medium"
            >
              Back to Fee Account
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

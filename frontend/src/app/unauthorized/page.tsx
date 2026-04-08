import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#faf9f7] px-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-gray-800">Access not allowed</h1>
        <p className="mt-2 text-gray-600">
          Your account does not have permission to view this page, or no role is assigned.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block px-6 py-3 rounded-lg bg-[#4c1d95] hover:bg-[#5b21b6] text-white font-medium"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}

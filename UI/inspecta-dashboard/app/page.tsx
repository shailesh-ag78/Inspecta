"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader } from "lucide-react";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/taskmanagement");
  }, [router]);

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-blue-500">
      <Loader className="w-12 h-12 animate-spin mb-4" />
      <p className="text-sm font-medium animate-pulse">Redirecting to Dashboard...</p>
    </div>
  );
}

"use client"

export function CrewLoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="my-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
    <p>{message}</p>
    <button onClick={retry} className="mt-2 rounded-lg bg-white px-3 py-2 font-semibold">다시 시도</button>
  </div>
}

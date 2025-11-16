"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { deleteBook, getBookPdfUrl, listBooks } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

export default function PurchasedPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["books", "purchased"],
    queryFn: listBooks,
  });
  const list = Array.isArray(data) ? data : [];
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleDownload = (id: number) => {
    const url = getBookPdfUrl(id);
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleDelete = async (id: number, title?: string | null) => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `Delete "${title || "this book"}"? This cannot be undone.`
      );
      if (!ok) return;
    }
    try {
      setActionError(null);
      setDeletingId(id);
      await deleteBook(id);
      await refetch();
    } catch (e: any) {
      setActionError(e?.message || "Failed to delete book");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main>
      <h1 className="text-xl font-semibold">Purchased</h1>
      {/* Removed extra header buttons per request */}
      {error && (
        <p className="text-red-600">
          {String((error as any)?.message || error)}
        </p>
      )}
      {actionError && !error && (
        <p className="text-red-600 mt-1">{actionError}</p>
      )}
      {isLoading && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card">
              <Skeleton className="w-full aspect-[3/4]" />
              <div className="mt-2 h-4 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      )}
      {!isLoading && list.length === 0 && (
        <p>
          No books yet. Try{" "}
          <Link className="underline" href="/books">
            creating one
          </Link>
          .
        </p>
      )}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {list.map((b) => (
          <div key={b.id} className="card">
            <Link href={`/books/${b.id}`} className="block">
              <div className="w-full aspect-[3/4] bg-gray-100 overflow-hidden rounded-md">
                {b.cover_path ? (
                  <img
                    alt={b.title}
                    src={`/api/image/book/cover-thumb?bookId=${
                      b.id
                    }&w=360&h=480${
                      b.completed_at || b.updated_at || b.created_at
                        ? `&v=${encodeURIComponent(
                            b.completed_at ||
                              b.updated_at ||
                              (b.created_at as any)
                          )}`
                        : ""
                    }`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center text-gray-500">
                    No cover
                  </div>
                )}
              </div>
              <div className="mt-2">
                <div className="font-semibold truncate">{b.title}</div>
                <div className="text-xs text-gray-500">{b.status}</div>
              </div>
            </Link>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href={`/books/${b.id}`} className="btn">
                View
              </Link>
              {b.status === "completed" && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleDownload(b.id)}
                >
                  Download
                </button>
              )}
              <button
                type="button"
                className="btn"
                style={{
                  background: "transparent",
                  color: "inherit",
                  borderColor: "hsl(var(--border))",
                }}
                disabled={deletingId === b.id}
                onClick={() => handleDelete(b.id, b.title)}
              >
                {deletingId === b.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

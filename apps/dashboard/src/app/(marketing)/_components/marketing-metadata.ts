import type { Metadata } from "next";

/** Shared metadata shape for `/product/*` marketing pages. */
export function createProductPageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: `/product/${string}`;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
    twitter: { title, description },
  };
}

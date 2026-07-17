export interface RequestOptions extends RequestInit {
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
}

export async function api<TResponse>(path: string, options?: RequestOptions) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

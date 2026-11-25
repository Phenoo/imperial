import type { User } from "firebase/auth";

export class StaffRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function staffRequest<T>(user: User, path: string, options: RequestInit = {}): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(`/api/admin/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new StaffRequestError(data.fields?.[0]?.message ?? data.error ?? "Couldn’t complete the request.", response.status);
  return data;
}

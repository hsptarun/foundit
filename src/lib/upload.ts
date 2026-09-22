/**
 * Frontend item-image upload helper.
 *
 * Sends the file to the FoundIt backend (`/api/uploads/item-images`), which
 * streams it into Supabase Storage and records it in `item_images`.
 * The existing SQLite session cookie authenticates the request.
 *
 * On any failure (not signed in, Supabase not configured, network error)
 * it returns `{ success: false }` so the UI can keep its existing local
 * preview behavior untouched.
 */

export interface UploadedImageRef {
  id: string;
  storage_path: string;
  image_url: string;
}

export interface UploadResult {
  success: boolean;
  image?: UploadedImageRef;
  error?: string;
}

export async function uploadItemImage(file: File): Promise<UploadResult> {
  try {
    // The server requires the CSRF header on mutating requests (cookie exists
    // after app load via /api/auth/csrf) — fetch it fresh to be safe.
    let csrfToken: string | null = null;
    try {
      const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
      if (csrfRes.ok) {
        csrfToken = (await csrfRes.json())?.csrfToken ?? null;
      }
    } catch {
      // proceed without; server will tell us if it's required
    }

    const headers: Record<string, string> = {};
    if (csrfToken) headers['x-csrf-token'] = csrfToken;

    const formData = new FormData();
    formData.append('images', file);

    const res = await fetch('/api/uploads/item-images', {
      method: 'POST',
      headers,
      credentials: 'include', // foundit_session cookie (SQLite auth — unchanged)
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error || `Upload failed (${res.status})` };
    }

    const data = await res.json();
    const first = data?.images?.[0];
    if (!first) return { success: false, error: 'Upload returned no image reference.' };

    return {
      success: true,
      image: {
        id: first.id,
        storage_path: first.storage_path,
        image_url: first.image_url,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error during upload' };
  }
}

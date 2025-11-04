import { api, API_BASE_ORIGIN } from "./client";

export interface TemplateParams {
  name?: string;
  gender?: "male" | "female";
}

export interface BookCreationData {
  files: string[];
  title: string;
  page_count: number;
  character_description?: string;
  positive_prompt?: string;
  negative_prompt?: string;
  story_source: "custom" | "template";
  template_key?: string;
  template_params?: TemplateParams;
  paymentId?: number;
  applyFreeTrial?: boolean;
}

export interface StorylinePageSummary {
  page_number: number;
  image_prompt: string;
}

export interface StoryTemplateSummary {
  slug: string;
  name: string;
  description?: string | null;
  age?: string | null;
  version?: number;
  page_count: number;
  cover_path?: string | null;
  demo_images?: (string | null)[];
  storyline_pages?: StorylinePageSummary[];
  credits_balance?: number; // included by /books/stories/templates for current user
  // Optional pricing fields returned by /books/stories/templates
  currency?: string | null;
  price_dollars?: number | null;
  discount_price?: number | null;
  final_price?: number | null;
  promotion_type?: string | null;
  promotion_label?: string | null;
  free_trial_slug?: string | null;
  free_trial_consumed?: boolean | null;
  credits_required?: number | null;
}

export async function getStoryTemplates(): Promise<{
  stories: StoryTemplateSummary[];
}> {
  const response = await api.get("/books/stories/templates");
  return response.data;
}

export function getStoryCoverUrl(
  coverPath?: string | null,
  token?: string | null
): string | null {
  if (!coverPath) return null;
  const baseUrl = API_BASE_ORIGIN;
  if (token) {
    return `${baseUrl}/books/stories/cover-public?path=${encodeURIComponent(
      coverPath
    )}&token=${encodeURIComponent(token)}`;
  }
  return `${baseUrl}/books/stories/cover?path=${encodeURIComponent(coverPath)}`;
}

export function getStoryThumbUrl(
  coverPath?: string | null,
  token?: string | null,
  width: number = 320,
  version?: string | number
): string | null {
  if (!coverPath) return null;
  const baseUrl = API_BASE_ORIGIN;
  if (token) {
    const v = version != null ? `&v=${encodeURIComponent(String(version))}` : '';
    return `${baseUrl}/books/media/resize-public?path=${encodeURIComponent(coverPath)}&w=${encodeURIComponent(String(width))}&token=${encodeURIComponent(token)}${v}`;
  }
  // Fallback to original (non-token) cover if token absent
  return getStoryCoverUrl(coverPath, token);
}

export function getBookCoverUrl(bookId: number, token?: string): string {
  const baseUrl = API_BASE_ORIGIN;
  if (token) {
    return `${baseUrl}/books/${bookId}/cover-public?token=${encodeURIComponent(
      token
    )}`;
  }
  return `${baseUrl}/books/${bookId}/cover`;
}

export function getBookCoverThumbUrl(
  bookId: number,
  token?: string | null,
  width: number = 320,
  version?: string | number
): string {
  const baseUrl = API_BASE_ORIGIN;
  if (token) {
    const v = version != null ? `&v=${encodeURIComponent(String(version))}` : '';
    return `${baseUrl}/books/${bookId}/cover-thumb-public?w=${encodeURIComponent(String(width))}&token=${encodeURIComponent(token)}${v}`;
  }
  // Without token we can't access thumb; fall back to base cover
  return getBookCoverUrl(bookId, undefined);
}

export function getMediaFileUrl(path?: string | null): string | null {
  // Reuse the same endpoint; backend validates MEDIA_ROOT containment.
  return getStoryCoverUrl(path ?? undefined);
}

export function getMediaThumbUrl(
  path?: string | null,
  token?: string | null,
  width: number = 320
): string | null {
  if (!path) return null;
  const baseUrl = API_BASE_ORIGIN;
  if (token) {
    return `${baseUrl}/books/media/resize-public?path=${encodeURIComponent(
      path
    )}&w=${encodeURIComponent(String(width))}&token=${encodeURIComponent(
      token
    )}`;
  }
  return getMediaFileUrl(path);
}

// Unified thumbnail URL helper
export type ThumbUrlOptions = {
  token?: string | null;
  width?: number;
  height?: number;
  version?: string | number | null;
  bookId?: number;
  path?: string | null;
};

export function getThumbUrl(opts: ThumbUrlOptions): string | null {
  const { token, width = 320, height, version } = opts;
  const v = version != null ? String(version) : undefined;
  if (typeof opts.bookId === 'number') {
    return getBookCoverThumbUrl(opts.bookId, token ?? null, width, v);
  }
  if (opts.path) {
    // Use generic media resize for arbitrary media paths
    const baseUrl = API_BASE_ORIGIN;
    if (token) {
      const params = new URLSearchParams({
        path: opts.path,
        w: String(width),
        token,
      });
      if (height && height > 0) params.set('h', String(height));
      if (v) params.set('v', v);
      return `${baseUrl}/books/media/resize-public?${params.toString()}`;
    }
    return getMediaFileUrl(opts.path);
  }
  return null;
}

// Book viewer page image URL (binary), optionally resized
export function getBookPageImageUrl(
  bookId: number,
  pageNumber: number,
  token?: string | null,
  width?: number,
  height?: number,
  version?: string | number | null
): string {
  const baseUrl = API_BASE_ORIGIN;
  const params = new URLSearchParams();
  if (width && width > 0) params.set('w', String(width));
  if (height && height > 0) params.set('h', String(height));
  if (token) params.set('token', token);
  if (version != null) params.set('v', String(version));
  return `${baseUrl}/books/${bookId}/pages/${pageNumber}/image-public?${params.toString()}`;
}

export interface Book {
  id: number;
  title: string;
  story_source?: string;
  template_key?: string;
  template_params?: TemplateParams;
  theme?: string;
  target_age?: string;
  page_count: number;
  status: string;
  progress_percentage: number;
  error_message?: string;
  pdf_path?: string;
  preview_image_path?: string;
  created_at: string;
  completed_at?: string;
}

export interface BookPage {
  id: number;
  page_number: number;
  text_content: string;
  image_description: string;
  image_path?: string;
  image_status: string;
  created_at: string;
  image_completed_at?: string;
}

export interface BookWithPages extends Book {
  pages: BookPage[];
}

export interface BookPreview {
  book_id: number;
  title: string;
  status: string;
  progress: number;
  pages: Array<{
    page_number: number;
    text: string;
    image_status: string;
    image_data?: string;
  }>;
  total_pages: number;
}

export async function createBook(
  token: string,
  data: BookCreationData
): Promise<Book> {
  try {
    const formData = new FormData();

    // Add all image files (1-3 images)
    data.files.forEach((fileUri, index) => {
      // Detect file type from URI
      const fileExtension = fileUri.split(".").pop()?.toLowerCase() || "jpg";
      const mimeType = fileExtension === "png" ? "image/png" : "image/jpeg";

      formData.append("files", {
        uri: fileUri,
        type: mimeType,
        name: `character_${index}.${fileExtension}`,
      } as any);
    });

    // Add form fields
    formData.append("title", data.title);
    formData.append("page_count", data.page_count.toString());
    if (data.character_description) {
      formData.append("character_description", data.character_description);
    }
    if (data.positive_prompt) {
      formData.append("positive_prompt", data.positive_prompt);
    }
    if (data.negative_prompt) {
      formData.append("negative_prompt", data.negative_prompt);
    }

    formData.append("story_source", data.story_source);
    if (data.template_key) {
      formData.append("template_key", data.template_key);
    }
    if (data.template_params) {
      formData.append("template_params", JSON.stringify(data.template_params));
    }

    if (typeof data.paymentId === "number") {
      formData.append("payment_id", String(data.paymentId));
    }

    if (data.applyFreeTrial) {
      formData.append("apply_free_trial", "true");
    }

    const response = await api.post("/books/create", formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "multipart/form-data",
      },
      timeout: 60000, // 1 minute timeout for upload
    });

    return response.data;
  } catch (error: any) {
    console.error(
      "Create book API error:",
      error.response?.data || error.message
    );
    throw error;
  }
}

export async function getBookStatus(
  token: string,
  bookId: number
): Promise<Book> {
  const response = await api.get(`/books/${bookId}/status`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

export async function getBookDetails(
  token: string,
  bookId: number
): Promise<BookWithPages> {
  const response = await api.get(`/books/${bookId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

export async function getBookList(token: string): Promise<{ books: Book[] }> {
  const response = await api.get("/books/list", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

export async function getBookPreview(
  token: string,
  bookId: number
): Promise<BookPreview> {
  const response = await api.get(`/books/${bookId}/preview`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

export function getBookPdfUrl(bookId: number): string {
  const baseUrl = API_BASE_ORIGIN;
  return `${baseUrl}/books/${bookId}/pdf`;
}

export async function downloadBookPdf(
  token: string,
  bookId: number
): Promise<Blob> {
  const response = await api.get(`/books/${bookId}/pdf`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    responseType: "blob",
  });
  return response.data;
}

export async function deleteBook(
  token: string,
  bookId: number
): Promise<{ message: string }> {
  const response = await api.delete(`/books/${bookId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

export async function retryBookCreation(
  token: string,
  bookId: number
): Promise<{ message: string; job_id: string }> {
  const response = await api.post(
    `/books/${bookId}/retry`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
}

export async function adminRegenerateBook(
  token: string,
  bookId: number
): Promise<{ message: string; job_id: string }> {
  const response = await api.post(
    `/books/${bookId}/admin-regenerate`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
}

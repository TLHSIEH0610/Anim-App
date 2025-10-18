import { api } from "./client";

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
}

export interface StoryTemplateSummary {
  slug: string;
  name: string;
  description?: string | null;
  default_age?: string | null;
  page_count: number;
}

export async function getStoryTemplates(): Promise<{ stories: StoryTemplateSummary[] }> {
  const response = await api.get("/books/stories/templates");
  return response.data;
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

export async function createBook(token: string, data: BookCreationData): Promise<Book> {
  try {
    const formData = new FormData();

    // Add all image files (1-4 images)
    data.files.forEach((fileUri, index) => {
      // Detect file type from URI
      const fileExtension = fileUri.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = fileExtension === 'png' ? 'image/png' : 'image/jpeg';

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

    const response = await api.post("/books/create", formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "multipart/form-data",
      },
      timeout: 60000, // 1 minute timeout for upload
    });

    return response.data;
  } catch (error: any) {
    console.error("Create book API error:", error.response?.data || error.message);
    throw error;
  }
}

export async function getBookStatus(token: string, bookId: number): Promise<Book> {
  const response = await api.get(`/books/${bookId}/status`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

export async function getBookDetails(token: string, bookId: number): Promise<BookWithPages> {
  const response = await api.get(`/books/${bookId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

export async function getBookList(token: string): Promise<{ books: Book[] }> {
  const response = await api.get('/books/list', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

export async function getBookPreview(token: string, bookId: number): Promise<BookPreview> {
  const response = await api.get(`/books/${bookId}/preview`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

export function getBookPdfUrl(bookId: number): string {
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE || 'http://localhost:8000';
  return `${baseUrl}/books/${bookId}/pdf`;
}

export async function downloadBookPdf(token: string, bookId: number): Promise<Blob> {
  const response = await api.get(`/books/${bookId}/pdf`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    responseType: 'blob',
  });
  return response.data;
}

export async function deleteBook(token: string, bookId: number): Promise<{ message: string }> {
  const response = await api.delete(`/books/${bookId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

export async function retryBookCreation(token: string, bookId: number): Promise<{ message: string; job_id: string }> {
  const response = await api.post(`/books/${bookId}/retry`, {}, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

export async function adminRegenerateBook(token: string, bookId: number): Promise<{ message: string; job_id: string }> {
  const response = await api.post(`/books/${bookId}/admin-regenerate`, {}, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

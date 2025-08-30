import { api } from "./client";

export async function uploadImage(token: string, fileUri: string) {
  try {
    const formData = new FormData();
    formData.append("file", {
      uri: fileUri,
      type: "image/png", // adjust for jpg/jpeg if needed
      name: "upload.png",
    } as any);

    const response = await api.post("/jobs/upload", formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "multipart/form-data",
      },
    });

    return response.data; // { job_id, status }
  } catch (e) {
    console.log("upload image api error", e);
  }
}

export async function getJobStatus(jobId: number) {
  const response = await api.get(`/jobs/status/${jobId}`);
  return response.data; // { job_id, status, input_path, output_path, created_at, completed_at }
}

export async function getJobList() {
  const response = await api.get('/jobs/list');
  return response.data; // { jobs: [...] }
}

export function getJobImageUrl(jobId: number) {
  return `${process.env.EXPO_PUBLIC_API_BASE || 'http://localhost:8000'}/jobs/image/${jobId}`;
}

export async function getJobImageData(jobId: number) {
  const response = await api.get(`/jobs/image-data/${jobId}`);
  return response.data; // { job_id, image_data, filename }
}

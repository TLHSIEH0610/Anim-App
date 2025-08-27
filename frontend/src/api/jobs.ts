import { api } from "./client";

export async function uploadImage(token: string, fileUri: string) {
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
}

export async function getJobStatus(jobId: number) {
  const response = await api.get(`/jobs/status/${jobId}`);
  return response.data; // { job_id, status, output? }
}

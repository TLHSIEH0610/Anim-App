import axios from "axios";

const API_BASE = "http://localhost:8000"; // use your backend host (replace if using Android emulator)

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

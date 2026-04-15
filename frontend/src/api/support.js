import { apiClient } from '../config';

export async function fetchFaqs() {
  const res = await apiClient.get('/support/faqs');
  return res.data;
}

export async function createInquiry({ category, title, content }) {
  const res = await apiClient.post('/support/inquiries', { category, title, content });
  return res.data;
}

export async function fetchMyInquiries() {
  const res = await apiClient.get('/support/inquiries/me');
  return res.data;
}
export async function createFaq({ category, question, answer, order, isActive }) {
  const res = await apiClient.post('/support/faqs', {
    category,
    question,
    answer,
    order,
    isActive,
  });
  return res.data;
}
import { getSupabase } from './supabase';

const ID_QUERY = `
  id,
  title,
  description,
  lessons:lesson(
    id, title, note, videos, slide_url
  )
`;

export async function getCourseDataForScorm(courseId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('course')
    .select(ID_QUERY)
    .eq('id', courseId)
    .single();

  if (error) {
    console.error('Error fetching course data for SCORM export:', error);
    return null;
  }

  return data;
}

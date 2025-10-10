import { json } from '@sveltejs/kit';
import { getServerSupabase } from '$lib/utils/functions/supabase.server';
import scorm from 'simple-scorm-packager';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

const supabase = getServerSupabase();

const ID_QUERY = `
  id,
  title,
  description,
  lessons:lesson(
    id, title, note, videos, slide_url
  )
`;

async function getCourseDataForScorm(courseId: string) {
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

export async function POST({ params, setHeaders }) {
  const { courseId } = params;
  let tmpDir: string | null = null;

  try {
    if (!courseId) {
      return json(
        {
          error: 'Invalid request',
          details: 'Course ID is required',
          code: 'MISSING_COURSE_ID'
        },
        { status: 400 }
      );
    }

    console.log(`[SCORM] Starting SCORM generation for course: ${courseId}`);

    const courseData = await getCourseDataForScorm(courseId);

    if (!courseData) {
      return json(
        {
          error: 'Course not found',
          details: `No course found with ID: ${courseId}`,
          code: 'COURSE_NOT_FOUND'
        },
        { status: 404 }
      );
    }

    console.log(
      `[SCORM] Found course: ${courseData.title} with ${courseData.lessons?.length || 0} lessons`
    );

    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'scorm-'));
    const contentDir = path.join(tmpDir, 'scorm-content');
    await fsp.mkdir(contentDir);

    const lessons = courseData.lessons || [];

    if (lessons.length === 0) {
      return json(
        {
          error: 'No lessons found',
          details: 'This course has no lessons to include in the SCORM package',
          code: 'NO_LESSONS'
        },
        { status: 400 }
      );
    }

    console.log(`[SCORM] Creating HTML files for ${lessons.length} lessons`);

    for (const lesson of lessons) {
      const lessonHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${lesson.title}</title>
        <meta charset="UTF-8">
      </head>
      <body>
        <h1>${lesson.title}</h1>
        <div>${lesson.note || ''}</div>
      </body>
    </html>
  `;
      const lessonPath = path.join(contentDir, `lesson-${lesson.id}.html`);
      await fsp.writeFile(lessonPath, lessonHtml);
    }

    const config = {
      version: '1.2',
      organization: courseData.title,
      title: courseData.title,
      language: 'en-US',
      source: contentDir,
      package: {
        name: courseData.title.replace(/[^a-zA-Z0-9]/g, '_'),
        version: '1.0',
        date: new Date().toISOString().split('T')[0],
        outputFolder: tmpDir,
        zip: true
      },
      resources: lessons.map((lesson) => ({
        id: `lesson-${lesson.id}`,
        href: `lesson-${lesson.id}.html`,
        title: lesson.title
      }))
    };

    console.log(`[SCORM] Creating SCORM package with config:`, config);

    // Use the packager as a function with a promise wrapper
    await new Promise((resolve, reject) => {
      scorm(config, (result) => {
        if (result === 'Done') {
          resolve(result);
        } else {
          reject(new Error(`SCORM packaging failed: ${result}`));
        }
      });
    });

    // Find the actual ZIP file created by the packager
    const files = await fsp.readdir(tmpDir);
    const zipFile = files.find((file) => file.endsWith('.zip'));

    if (!zipFile) {
      throw new Error('No ZIP file was created by the SCORM packager');
    }

    const zipPath = path.join(tmpDir, zipFile);
    console.log(`[SCORM] Found ZIP file: ${zipPath}`);

    console.log(`[SCORM] Reading ZIP file for response...`);

    const zipBuffer = await fsp.readFile(zipPath);

    // Clean up temp directory
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch((err) => {
        console.error('[SCORM] Error cleaning up temp directory:', err);
      });
      tmpDir = null;
    }

    const filename = `${courseData.title.replace(/[^a-zA-Z0-9]/g, '_')}.zip`;

    setHeaders({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache'
    });

    return new Response(zipBuffer);
  } catch (error) {
    console.error('[SCORM] Detailed error:', JSON.stringify(error, null, 2));
    console.error('[SCORM] Error generating SCORM package:', error);

    // Clean up temp directory on error
    if (tmpDir) {
      try {
        await fsp.rm(tmpDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('[SCORM] Error cleaning up temp directory:', cleanupError);
      }
    }

    return json(
      {
        error: 'Failed to generate SCORM package',
        details: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'GENERATION_ERROR'
      },
      { status: 500 }
    );
  }
}

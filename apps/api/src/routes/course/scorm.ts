import { Hono } from 'hono';
import { getCourseDataForScorm } from '../../utils/scorm';
import scorm from 'simple-scorm-packager';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export const scormRouter = new Hono().post('/:courseId', async (c) => {
  const courseId = c.req.param('courseId');

  const courseData = await getCourseDataForScorm(courseId);

  if (!courseData) {
    return c.json({ error: 'Course not found' }, 404);
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scorm-'));
  const contentDir = path.join(tmpDir, 'scorm-content');
  await fs.mkdir(contentDir);

  const lessons = courseData.lessons || [];

  for (const lesson of lessons) {
    const lessonHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${lesson.title}</title>
        </head>
        <body>
          <h1>${lesson.title}</h1>
          <div>${lesson.note}</div>
        </body>
      </html>
    `;
    const lessonPath = path.join(contentDir, `lesson-${lesson.id}.html`);
    await fs.writeFile(lessonPath, lessonHtml);
  }

  const config = {
    version: '1.2',
    organization: courseData.title,
    title: courseData.title,
    language: 'en-US',
    resources: lessons.map((lesson) => ({
      id: `lesson-${lesson.id}`,
      href: `lesson-${lesson.id}.html`,
      title: lesson.title
    }))
  };

  const packager = new scorm(config);
  packager.source(contentDir);

  const zipPath = path.join(tmpDir, `${courseData.title}.zip`);

  await packager.zip(zipPath);

  const zipBuffer = await fs.readFile(zipPath);

  await fs.rm(tmpDir, { recursive: true, force: true });

  c.header('Content-Type', 'application/zip');
  c.header('Content-Disposition', `attachment; filename="${courseData.title}.zip"`);

  const uint8Array = new Uint8Array(zipBuffer);

  return new Response(uint8Array, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${courseData.title}.zip"`
    }
  });
});

<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import Box from '$lib/components/Box/index.svelte';
  import ActivateSectionsModal from '$lib/components/Course/components/Lesson/ActivateSectionsModal.svelte';
  import DeleteLessonConfirmation from '$lib/components/Course/components/Lesson/DeleteLessonConfirmation.svelte';
  import LessonList from '$lib/components/Course/components/Lesson/LessonList.svelte';
  import LessonSectionList from '$lib/components/Course/components/Lesson/LessonSectionList.svelte';
  import NewLessonModal from '$lib/components/Course/components/Lesson/NewLessonModal.svelte';
  import { handleAddLessonWidget } from '$lib/components/Course/components/Lesson/store';
  import {
    handleDelete,
    lessons,
    lessonSections
  } from '$lib/components/Course/components/Lesson/store/lessons';
  import { course } from '$lib/components/Course/store';
  import CourseContainer from '$lib/components/CourseContainer/index.svelte';
  import { PageBody, PageNav } from '$lib/components/Page';
  import { VARIANTS } from '$lib/components/PrimaryButton/constants';
  import PrimaryButton from '$lib/components/PrimaryButton/index.svelte';
  import RoleBasedSecurity from '$lib/components/RoleBasedSecurity/index.svelte';
  import { snackbar } from '$lib/components/Snackbar/store';
  import { t } from '$lib/utils/functions/translations';
  import { getAccessToken } from '$lib/utils/functions/supabase';

  import { profile } from '$lib/utils/store/user';
  import type { Lesson } from '$lib/utils/types';
  import { COURSE_VERSION } from '$lib/utils/types';

  export let data;

  const query = new URLSearchParams($page.url.search);

  let lessonEditing: string | undefined;
  let lessonToDelete: Lesson | undefined;
  let openDeleteModal: boolean = false;
  let isFetching: boolean = false;
  let reorder = false;
  let activateSections = false;

  function addLesson() {
    $handleAddLessonWidget.open = true;

    $handleAddLessonWidget.isSection = $course.version === COURSE_VERSION.V2;
  }

  function hasUserCompletedLesson(completion) {
    return completion?.find((c) => c.profile_id === $profile.id);
  }

  const getLessons = () => {
    if ($course.version === COURSE_VERSION.V1) {
      return $lessons;
    } else {
      const _lessons: Lesson[] = [];

      $lessonSections.forEach((section) => {
        _lessons.push(...section.lessons);
      });

      return _lessons;
    }
  };

  function findFirstIncompleteLesson() {
    return getLessons().find(
      (lesson) => !hasUserCompletedLesson(lesson.lesson_completion) && lesson.is_unlocked === true
    );
  }

  function onNextQuery(lessons) {
    if (!isFetching && lessons.length > 0) {
      const incompleteLesson = findFirstIncompleteLesson();

      if (incompleteLesson) {
        goto(`/courses/${data.courseId}/lessons/${incompleteLesson.id}`);
      } else {
        goto(`/courses/${data.courseId}/lessons`);
      }
    }
  }

  async function downloadScorm() {
    try {
      // First validate the session and get a fresh token
      const accessToken = await getAccessToken();

      if (!accessToken) {
        snackbar.error('Please log in to download SCORM package');
        return;
      }

      console.log('[SCORM Download] Starting download with token length:', accessToken.length);
      console.log('[SCORM Download] Course ID:', data.courseId);
      console.log('[SCORM Download] Token preview:', accessToken.substring(0, 20) + '...');

      // Use the new dashboard API route for SCORM download
      console.log('[SCORM Download] Using dashboard API route');
      const response = await fetch(`/api/scorm/${data.courseId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: accessToken
        }
      });
      console.log('[SCORM Download] Dashboard API response status:', response.status);

      if (!response.ok) {
        let errorMessage = 'Error downloading SCORM package';

        // Handle 401 Unauthorized specifically
        if (response.status === 401) {
          errorMessage = 'Authentication required. Please log in again.';
          console.error('[SCORM Download] 401 Unauthorized - token may be expired or invalid');
          console.error(
            '[SCORM Download] Response headers:',
            Object.fromEntries(response.headers.entries())
          );

          // Try to get more details about the auth error
          try {
            const errorText = await response.text();
            console.error('[SCORM Download] 401 Error body:', errorText);
          } catch (e) {
            console.error('[SCORM Download] Could not read error body');
          }

          snackbar.error(errorMessage);

          // Optionally redirect to login or trigger re-authentication
          // goto('/login');
          return;
        }

        try {
          const errorData = await response.json();
          console.error('[SCORM Download] Error response:', errorData);

          switch (errorData.code) {
            case 'COURSE_NOT_FOUND':
              errorMessage = 'Course not found';
              break;
            case 'NO_LESSONS':
              errorMessage = 'This course has no lessons to export';
              break;
            case 'GENERATION_ERROR':
              errorMessage = `Failed to generate SCORM package: ${errorData.details}`;
              break;
            case 'MISSING_COURSE_ID':
              errorMessage = 'Invalid course ID';
              break;
            default:
              errorMessage = errorData.details || errorData.error || errorMessage;
          }
        } catch (parseError) {
          console.error('[SCORM Download] Could not parse error response:', parseError);
          const errorText = await response.text().catch(() => 'Unknown error');
          errorMessage = `Server error (${response.status}): ${response.statusText} - ${errorText}`;
        }

        snackbar.error(errorMessage);
        return;
      }

      console.log('[SCORM Download] Response successful, processing blob');
      console.log('[SCORM Download] Content-Type:', response.headers.get('content-type'));
      console.log('[SCORM Download] Content-Length:', response.headers.get('content-length'));

      const blob = await response.blob();
      console.log('[SCORM Download] Blob size:', blob.size);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${$course.title.replace(/[^a-zA-Z0-9]/g, '_')}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      snackbar.success('SCORM package downloaded successfully');
    } catch (error) {
      console.error('[SCORM Download] Unexpected error:', error);

      // Handle specific API client errors
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as any;
        if (apiError.status === 401) {
          snackbar.error('Authentication required. Please log in again.');
          return;
        }
      }

      snackbar.error('Network error occurred while downloading SCORM package');
    }
  }

  $: shouldGoToNextLesson = query.get('next') === 'true';
  $: !isFetching && shouldGoToNextLesson && onNextQuery($lessons);
  $: lessonsLength =
    $course.version === COURSE_VERSION.V1 ? $lessons.length : $lessonSections.length;
</script>

<NewLessonModal />

<ActivateSectionsModal bind:open={activateSections} />

<DeleteLessonConfirmation
  bind:openDeleteModal
  deleteLesson={() => handleDelete(lessonToDelete?.id)}
/>

<CourseContainer bind:isFetching bind:courseId={data.courseId}>
  <PageNav title={$t('course.navItem.lessons.heading_v2')}>
    <div slot="widget" class="flex w-full justify-end gap-2">
      <RoleBasedSecurity allowedRoles={[1, 2]}>
        {#if $course.version === COURSE_VERSION.V1}
          <PrimaryButton
            label={$t(`course.navItem.lessons.section_prompt.cta`)}
            variant={VARIANTS.OUTLINED}
            onClick={() => (activateSections = !activateSections)}
            isDisabled={!!lessonEditing}
          />
        {/if}
        <PrimaryButton
          label={$t(
            `course.navItem.lessons.add_lesson.${reorder ? 'end_reorder' : 'start_reorder'}`
          )}
          variant={VARIANTS.OUTLINED}
          onClick={() => (reorder = !reorder)}
          isDisabled={!!lessonEditing}
        />
        <PrimaryButton
          label={$t('course.navItem.lessons.add_lesson.button_title')}
          onClick={addLesson}
          isDisabled={!!lessonEditing}
        />
        <PrimaryButton
          label={$t('course.navItem.lessons.download_scorm')}
          onClick={downloadScorm}
          isDisabled={!!lessonEditing}
        />
      </RoleBasedSecurity>
    </div>
  </PageNav>

  <PageBody width="max-w-6xl" padding="p-0">
    {#if shouldGoToNextLesson}
      <Box className="w-full lg:w-11/12 lg:px-4 m-auto">
        <div class="flex flex-col items-center justify-between">
          <img src="/images/empty-lesson-icon.svg" alt="Lesson" class="mx-auto my-2.5" />
          <h2 class="my-1.5 text-xl font-normal">{$t('course.navItem.lessons.no_lesson')}</h2>
          <p class="text-center text-sm text-slate-500">
            {$t('course.navItem.lessons.share_your_knowledge')}
          </p>
        </div>
      </Box>
    {:else if lessonsLength > 0}
      {#if reorder}
        <p class="text-center text-xs italic text-gray-400 dark:text-white">
          {$t('course.navItem.lessons.drag')}
        </p>
      {/if}

      {#if $course.version === COURSE_VERSION.V1}
        <LessonList {reorder} {lessonEditing} bind:lessonToDelete bind:openDeleteModal />
      {:else if $course.version === COURSE_VERSION.V2}
        <LessonSectionList {reorder} {lessonEditing} />
      {/if}
    {:else}
      <Box className="w-full lg:w-11/12 lg:px-4 m-auto">
        <div class="flex flex-col items-center justify-between">
          <img src="/images/empty-lesson-icon.svg" alt="Lesson" class="mx-auto my-2.5" />
          <h2 class="my-1.5 text-xl font-normal">{$t('course.navItem.lessons.body_header')}</h2>
          <p class="text-center text-sm text-slate-500">
            {$t('course.navItem.lessons.body_content')}
          </p>
        </div>
      </Box>
    {/if}
  </PageBody>
</CourseContainer>

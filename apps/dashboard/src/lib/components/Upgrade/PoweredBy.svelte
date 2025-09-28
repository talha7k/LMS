<script>
  import { ArrowUpRight } from 'carbon-icons-svelte';

  import { t } from '$lib/utils/functions/translations';
  import { currentOrg, isFreePlan } from '$lib/utils/store/org';
</script>

{#if $isFreePlan}
  <a
    href={`https://lms.enrich.sa?utm_source=${$currentOrg.siteName}.lms.enrich.sa`}
    target="_blank"
    class="group fixed bottom-14 right-9 z-50 hover:no-underline"
  >
    <span
      class="overflow-hidden transition shadow-md duration-500 group-hover:bg-blue-600 group-hover:text-white flex items-center gap-1 dark:text-black bg-white border border-gray-50 group-hover:border-blue-600 rounded-md px-2 py-1 text-black text-sm font-medium"
    >
      <ArrowUpRight
        class="
            absolute left-3 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0
            opacity-0 translate-y-full -translate-x-full transition duration-500 text-white"
        size={16}
      />
      <img src="/logo-192.png" alt="logo" class="h-[24px] opacity-100 group-hover:opacity-0" />
      {$t('course.navItem.landing_page.powered_by')} LMS Enrich
    </span>
  </a>
{/if}

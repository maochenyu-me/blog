<script setup lang="ts">
const appConfig = useAppConfig()

useSeoMeta({
	title: '关于',
	description: `关于${appConfig.author.name}和「${appConfig.title}」：技术栈、心路历程，以及这个站在写什么。`,
})
</script>

<template>
<template #aside>
	<WidgetBlogStats />
	<WidgetBlogTech />
	<WidgetBlogLog />
</template>

<div class="about proper-height">
	<AboutProfile />

	<div class="about-grid">
		<AboutGreeting />
		<AboutSite />
		<AboutMotto />
		<AboutSkills />
		<AboutJourney />
		<AboutReward />
	</div>
</div>
</template>

<style scoped>
.about {
	padding: 0 1rem 1rem;
}

.about-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
	gap: 0.5rem;

	> .about-greeting,
	> .about-skills,
	> .about-journey,
	> .about-reward {
		grid-column: 1 / -1;
	}
}

@media (max-width: 768px) {
	.about {
		padding: 0 0.5rem 0.5rem;
	}

	.about-grid {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>

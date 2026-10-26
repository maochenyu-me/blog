<script setup lang="ts">
import { aboutSkills } from '~/data/about'
</script>

<template>
<section class="card about-skills">
	<p class="card-tips">
		技能
	</p>

	<ul class="list">
		<li
			v-for="(skill, index) in aboutSkills"
			:key="skill.name"
			class="skill"
			:style="{ '--index': index }"
		>
			<Icon :name="skill.icon" />
			<span v-text="skill.name" />
		</li>
	</ul>
</section>
</template>

<style scoped>
.about-skills {
	display: flex;
	flex-direction: column;
	gap: 0.7em;
	padding: 1.1em 1.3em;
	border: 1px solid var(--c-flat-card-border);
	background-color: var(--c-flat-card-bg);

	> .list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;
	}
}

.skill {
	display: inline-flex;
	align-items: center;
	gap: 0.4em;
	padding: 0.3em 0.7em 0.3em 0.55em;
	border: 1px solid var(--c-flat-card-border);
	border-radius: 0.5em;
	background-color: var(--c-flat-card-bg-2);
	font-size: 0.85em;
	color: var(--c-text-2);
	transition: transform 0.2s, border-color 0.2s, color 0.2s;
	animation: float-in 0.4s backwards;
	animation-delay: calc(var(--index) * 0.04s);

	> .iconify {
		font-size: 1.15em;
	}

	&:hover {
		border-color: var(--c-primary-soft);
		color: var(--c-text-1);
		transform: translateY(-2px);
	}
}

@media (prefers-reduced-motion: reduce) {
	.skill {
		transition: none;
		animation: none;
	}
}
</style>

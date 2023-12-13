import { crash } from "@cloudflare/cli";
import { inputPrompt } from "@cloudflare/cli/interactive";
import {
	createKvNamespace,
	createQueue,
	createR2Bucket,
	fetchKvNamespaces,
	fetchQueues,
	fetchR2Buckets,
} from "helpers/wrangler";
import { validateQueueName } from "./validators";
import { appendToWranglerToml } from "./workers";
import type { BindingInfo, QueueBindingInfo } from "./templateMap";
import type { C3Context } from "types";

export const bindResources = async (ctx: C3Context) => {
	if (ctx.args.deploy === false) {
		return;
	}

	if (!ctx.account?.id) {
		crash("Failed to read Cloudflare account.");
		return;
	}

	const bindingsConfig = ctx.template.bindings;
	if (!bindingsConfig) {
		return;
	}

	const { queues, kvNamespaces, r2Buckets } = bindingsConfig;
	if (queues) {
		for (const queue of queues) {
			await bindQueue(ctx, queue);
		}
	}

	if (kvNamespaces) {
		for (const kvNamespace of kvNamespaces) {
			await bindKvNamespace(ctx, kvNamespace);
		}
	}

	if (r2Buckets) {
		for (const r2Bucket of r2Buckets) {
			await bindR2Bucket(ctx, r2Bucket);
		}
	}
};

const bindQueue = async (
	ctx: C3Context,
	bindingDefinition: QueueBindingInfo
) => {
	const { boundVariable, defaultValue, producer, consumer } = bindingDefinition;

	const queues = await fetchQueues(ctx);
	if (queues.length > 0) {
		const queueOptions = [
			{ label: "Create a new queue", value: "--create" },
			...queues.map((q) => ({ label: q.queue_name, value: q.queue_name })),
		];

		const selectedQueue = await inputPrompt({
			type: "select",
			question: `Which queue should be bound to \`${boundVariable}\`?`,
			options: queueOptions,
			label: "queue",
		});

		if (selectedQueue !== "--create") {
			if (producer) {
				await addProducerBinding(ctx, boundVariable, selectedQueue);
			}
			if (consumer) {
				await addConsumerBinding(ctx, selectedQueue);
			}
			return;
		}
	}

	const newQueueName = await inputPrompt({
		type: "text",
		question: `What would you like to name your queue?`,
		defaultValue,
		validate: validateQueueName,
		label: "name",
	});

	await createQueue(ctx, newQueueName);
	if (producer) {
		await addProducerBinding(ctx, boundVariable, newQueueName);
	}
	if (consumer) {
		await addConsumerBinding(ctx, newQueueName);
	}
};

const addProducerBinding = async (
	ctx: C3Context,
	binding: string,
	queue: string
) => {
	await appendToWranglerToml(
		ctx,
		`
[[queues.producers]]
binding = "${binding}"
queue = "${queue}"
`
	);
};

const addConsumerBinding = async (ctx: C3Context, queue: string) => {
	await appendToWranglerToml(
		ctx,
		`
[[queues.consumers]]
queue = "${queue}"
`
	);
};

const bindKvNamespace = async (
	ctx: C3Context,
	bindingDefinition: BindingInfo
) => {
	const namespaces = await fetchKvNamespaces(ctx);
	const { boundVariable, defaultValue } = bindingDefinition;

	if (namespaces.length > 0) {
		const options = [
			{ label: "Create a new KV namespace", value: "--create" },
			...namespaces.map((ns) => ({ label: ns.title, value: ns.id })),
		];

		const selectedNs = await inputPrompt({
			type: "select",
			question: `Which KV namespace should be bound to \`${boundVariable}\`?`,
			options: options,
			label: "namespace",
		});

		if (selectedNs !== "--create") {
			await addKvBinding(ctx, boundVariable, selectedNs);
			return;
		}
	}

	const newNamespaceName = await inputPrompt({
		type: "text",
		question: `What would you like to name your KV namespace?`,
		defaultValue,
		validate: validateQueueName,
		label: "name",
	});

	const id = await createKvNamespace(ctx, newNamespaceName);
	await addKvBinding(ctx, boundVariable, id);
};

const addKvBinding = async (ctx: C3Context, binding: string, id: string) => {
	await appendToWranglerToml(
		ctx,
		`
[[kv_namespaces]]
binding = "${binding}"
id = "${id}"
`
	);
};

const bindR2Bucket = async (ctx: C3Context, bindingDefinition: BindingInfo) => {
	const r2Buckets = await fetchR2Buckets(ctx);
	const { boundVariable, defaultValue } = bindingDefinition;

	if (r2Buckets.length > 0) {
		const options = [
			{ label: "Create a new KV namespace", value: "--create" },
			...r2Buckets.map(({ name }) => ({ label: name, value: name })),
		];

		const selected = await inputPrompt({
			type: "select",
			question: `Which R2 bucket should be bound to \`${boundVariable}\`?`,
			options: options,
			label: "name",
		});

		if (selected !== "--create") {
			await addR2Bucket(ctx, boundVariable, selected);
			return;
		}
	}

	const newName = await inputPrompt({
		type: "text",
		question: `What would you like to name your R2 bucket?`,
		defaultValue,
		// TODO: update this
		validate: validateQueueName,
		label: "kv",
	});

	await createR2Bucket(ctx, newName);
	await addR2Bucket(ctx, boundVariable, newName);
};

const addR2Bucket = async (ctx: C3Context, binding: string, name: string) => {
	await appendToWranglerToml(
		ctx,
		`
[[r2_buckets]]
binding = "${binding}"
bucket_name = "${name}"
`
	);
};
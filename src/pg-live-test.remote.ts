import { query } from '$app/server';
import { prisma } from '$lib/internal/db';
import { createPgLiveQuery } from '$lib/pg-live-query';
import type { User } from '../generated/prisma/client';

type PgLiveChannels = {
	user_changes: {
		row: User;
		table: string;
		operation: 'INSERT' | 'UPDATE' | 'DELETE';
	};
};

const pgLiveQuery = createPgLiveQuery<PgLiveChannels>();

export const testPgListener = query.live(
	pgLiveQuery.fn({
		channel: 'user_changes',
		onInit: async () => {
			console.log('init');
			const user = await prisma.user.findFirst({});
			return user;
		},
		onNotified: async ({ payload }) => {
			console.log(payload);
			const user = await prisma.user.findFirst({
				where: {
					id: payload.row.id
				}
			});
			return user;
		},
		onServer: () => {
			console.log('got a new fevent');
		}
	})
);

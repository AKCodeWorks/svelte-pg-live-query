import { command } from '$app/server';
import { prisma } from './db.js';

export const createRandomUser = command(async () => {
	console.log('running create user');
	await prisma.user.create({
		data: {
			name: `User ${Math.floor(Math.random() * 1000)}`,
			email: `${Bun.randomUUIDv7()}@gmail.com`
		}
	});
});

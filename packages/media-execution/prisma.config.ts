import {defineConfig} from 'prisma/config';
// Generation/build needs no database credentials. Migration commands require DATABASE_URL.
export default defineConfig({schema:'prisma/schema.prisma',migrations:{path:'prisma/migrations'},datasource:{url:process.env.DATABASE_URL}});

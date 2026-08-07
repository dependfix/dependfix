export default defineNuxtRouteMiddleware(async () => {
    const { session } = await useSession()

    if (!session.value?.user) {
        return navigateTo('/login')
    }
})

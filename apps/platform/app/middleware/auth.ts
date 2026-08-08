export default defineNuxtRouteMiddleware(() => {
    const { session } = useSession()

    if (!session.value?.user) {
        return navigateTo('/login')
    }
})

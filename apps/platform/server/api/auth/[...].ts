import { getAuth } from '#server/utils/auth'

export default defineEventHandler(async (event) => {
    const auth = await getAuth()
    return auth.handler(toWebRequest(event))
})

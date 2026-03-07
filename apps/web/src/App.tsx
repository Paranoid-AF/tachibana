import { useQuery } from '@tanstack/react-query'
import { api } from './libs/api'

export default function App() {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data, error } = await api.health.get()
      if (error) throw error
      return data
    },
  })

  return <h1>Tachibana — {data?.status ?? '...'}</h1>
}

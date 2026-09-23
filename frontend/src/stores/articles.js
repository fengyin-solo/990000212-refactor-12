import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

const PAGE_SIZE = 10

/**
 * 文章管理共用处理：文章列表（含分页越界修正）、删除流程与统计/最近文章
 * 统一在这里走同一套加载、恢复与提示逻辑，避免各处各写一份导致显示旧数据。
 */
export const useArticleStore = defineStore('articles', () => {
  // 文章列表与分页
  const articles = ref([])
  const loading = ref(false)
  const currentPage = ref(1)
  const pagination = ref({
    total: 0,
    page: 1,
    limit: PAGE_SIZE,
    totalPages: 0
  })

  // 管理面板统计与最近文章
  const stats = reactive({
    totalArticles: 0,
    totalTags: 0,
    recentArticles: 0
  })
  const recentArticles = ref([])

  /**
   * 唯一的列表加载入口。
   * 删除最后一页最后一篇等场景下当前页可能已越界，
   * 服务端返回空列表但仍有数据时自动回退到最后一页并重新加载。
   */
  async function loadArticles() {
    loading.value = true
    try {
      const response = await api.get('/articles', {
        params: { page: currentPage.value, limit: pagination.value.limit }
      })

      const { articles: fetchedArticles, pagination: fetchedPagination } = response.data

      if (
        fetchedArticles.length === 0 &&
        fetchedPagination.total > 0 &&
        fetchedPagination.page > 1
      ) {
        currentPage.value = fetchedPagination.totalPages
        await loadArticles()
        return
      }

      articles.value = fetchedArticles
      pagination.value = fetchedPagination
    } catch (error) {
      console.error('Failed to fetch articles:', error)
      ElMessage.error('获取文章列表失败')
    } finally {
      loading.value = false
    }
  }

  function changePage(page) {
    currentPage.value = page
    return loadArticles()
  }

  // 进入文章管理页时与原页面行为保持一致：始终从第一页加载，并清空旧列表
  function initArticleList() {
    currentPage.value = 1
    articles.value = []
    return loadArticles()
  }

  /**
   * 统一的单条删除处理：确认 -> 删除 -> 成功提示 -> 走共用列表加载
   * （加载时自动处理分页越界）；取消则静默，失败则提示并保留现有列表。
   */
  async function deleteArticle(article) {
    try {
      await ElMessageBox.confirm(
        `确定要删除文章「${article.title}」吗？`,
        '确认删除',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )

      await api.delete(`/articles/${article.id}`)
      ElMessage.success('文章已删除')
      await loadArticles()
    } catch (error) {
      if (error !== 'cancel') {
        console.error('Failed to delete article:', error)
        ElMessage.error('删除文章失败')
      }
    }
  }

  // 管理面板统计（原实现静默失败，仅在控制台记录）
  async function loadStats() {
    try {
      const [articlesRes, tagsRes] = await Promise.all([
        api.get('/articles', { params: { page: 1, limit: 1000 } }),
        api.get('/tags')
      ])

      stats.totalArticles = articlesRes.data.pagination.total
      stats.totalTags = tagsRes.data.tags.length

      // Calculate articles from this week
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
      stats.recentArticles = articlesRes.data.articles.filter(
        a => new Date(a.created_at) > oneWeekAgo
      ).length
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  async function loadRecentArticles() {
    try {
      const response = await api.get('/articles', { params: { page: 1, limit: 5 } })
      recentArticles.value = response.data.articles
    } catch (error) {
      console.error('Failed to fetch recent articles:', error)
    }
  }

  // 进入管理面板时与原页面行为保持一致：重置后重新拉取
  function initDashboard() {
    stats.totalArticles = 0
    stats.totalTags = 0
    stats.recentArticles = 0
    recentArticles.value = []
    return Promise.all([loadStats(), loadRecentArticles()])
  }

  return {
    articles,
    loading,
    currentPage,
    pagination,
    stats,
    recentArticles,
    loadArticles,
    changePage,
    initArticleList,
    deleteArticle,
    loadStats,
    loadRecentArticles,
    initDashboard
  }
})

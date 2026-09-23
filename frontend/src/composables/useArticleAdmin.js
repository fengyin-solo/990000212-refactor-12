import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

/**
 * 文章管理页的共用数据处理：
 * 列表加载、翻页、单条删除（含分页越界修正与失败恢复）统一走这里，
 * 保证列表数据、分页位置与 total 统计始终来自同一次接口响应。
 */
export function useArticleAdmin() {
  const articles = ref([])
  const loading = ref(false)
  const currentPage = ref(1)
  const pagination = ref({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  })

  // 唯一的列表获取入口：初次进入、翻页、删除后刷新都走这里。
  // 列表、分页位置、total 统计在此一次性写入，避免各处分别更新造成旧数据。
  async function loadArticles() {
    loading.value = true
    try {
      let page = currentPage.value

      // 单条删除后当前页可能已消失（如删掉最后一页最后一条），
      // 用后端返回的 totalPages 检测越界并回退到最后一个有效页后重新拉取。
      for (;;) {
        const response = await api.get('/articles', {
          params: { page, limit: pagination.value.limit }
        })
        const pageInfo = response.data.pagination

        if (pageInfo.total > 0 && page > pageInfo.totalPages) {
          page = pageInfo.totalPages
          continue
        }

        articles.value = response.data.articles
        pagination.value = pageInfo
        // 文章已全部删空时回到第 1 页，其余情况与后端确认的页码对齐
        currentPage.value = pageInfo.total === 0 ? 1 : pageInfo.page
        break
      }
    } catch (error) {
      // 获取失败时保留现有列表与分页，不做局部覆盖，由调用方保持原状
      console.error('Failed to fetch articles:', error)
      ElMessage.error('获取文章列表失败')
    } finally {
      loading.value = false
    }
  }

  function handlePageChange(page) {
    currentPage.value = page
    loadArticles()
  }

  // 单条删除的统一处理：确认 -> 删除 -> 成功提示 -> 走共用刷新；
  // 任一步失败都不改动列表/分页状态，提示口径集中在此处。
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

      // 删除成功后，列表更新、越界回退、total 统计变化统一由 loadArticles 处理
      await loadArticles()
    } catch (error) {
      // 用户主动放弃（取消按钮或右上角关闭）不视为删除失败；
      // 只有接口报错才提示并保持现有列表、分页不变
      if (error !== 'cancel' && error !== 'close') {
        console.error('Failed to delete article:', error)
        ElMessage.error('删除文章失败')
      }
    }
  }

  return {
    articles,
    loading,
    currentPage,
    pagination,
    loadArticles,
    handlePageChange,
    deleteArticle
  }
}

import { DeleteOutlined, EyeOutlined, ForkOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, Button, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'
import { specimenAPI } from '../api'
import { CustodyBadge } from '../components/common/CustodyBadge'
import { EntityTable } from '../components/common/EntityTable'
import { SampleDrawer } from '../components/common/SampleDrawer'
import { useAuth } from '../hooks/useAuth'
import { usePagination } from '../hooks/usePagination'
import { useSpecimenStore } from '../stores/specimenStore'
import type { Specimen, SpecimenState } from '../types/domain'
import { formatDateTime } from '../utils/format'

interface AliquotTubeFormValue { tubeCode: string; volumeMl?: number; notes?: string }

export function SpecimensPage() {
  const { data, loading, load } = useSpecimenStore()
  const pagination = usePagination()
  const { can } = useAuth()
  const [search, setSearch] = useState('')
  const [state, setState] = useState<SpecimenState>()
  const [open, setOpen] = useState(false)
  const [aliquotTarget, setAliquotTarget] = useState<Specimen | null>(null)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<Specimen | null>(null)
  const [form] = Form.useForm()
  const [aliquotForm] = Form.useForm()
  const tubes: AliquotTubeFormValue[] = Form.useWatch('tubes', aliquotForm) ?? []
  const batchTotal = tubes.reduce((sum, tube) => sum + (Number(tube?.volumeMl) || 0), 0)
  const remaining = aliquotTarget?.volumeMl ?? 0
  const exceeded = Boolean(aliquotTarget) && batchTotal - remaining > 1e-9
  const refresh = () => load({ page: pagination.page, pageSize: pagination.pageSize, search, state })
  useEffect(() => { void refresh() }, [pagination.page, pagination.pageSize, state])

  const create = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await specimenAPI.create({ ...values, notes: values.notes || '' })
      message.success('样本接收登记成功')
      setOpen(false)
      form.resetFields()
      await refresh()
    } finally { setSaving(false) }
  }
  const show = async (specimen: Specimen) => setSelected(await specimenAPI.get(specimen.id))
  const openAliquotModal = (row: Specimen) => {
    setAliquotTarget(row)
    aliquotForm.setFieldsValue({ tubes: [{ tubeCode: `${row.accessionNo}-A${row.aliquotCount + 1}`, notes: '' }] })
  }
  const registerAliquots = async () => {
    if (!aliquotTarget) return
    const { tubes: values } = await aliquotForm.validateFields()
    setSaving(true)
    try {
      await specimenAPI.registerAliquots(aliquotTarget.id, values)
      message.success(`已登记 ${values.length} 管分装，样本状态更新为已分装`)
      setAliquotTarget(null)
      aliquotForm.resetFields()
      await refresh()
    } finally { setSaving(false) }
  }
  const columns: ColumnsType<Specimen> = [
    { title: '样本接收号', dataIndex: 'accessionNo', fixed: 'left', render: (value, row) => <Button type="link" className="table-link" onClick={() => void show(row)}>{value}</Button> },
    { title: '样本类型', dataIndex: 'sampleType' },
    { title: '受试者编码', dataIndex: 'subjectCode' },
    { title: '协议', dataIndex: 'protocolCode' },
    { title: '状态', dataIndex: 'state', render: (value) => <CustodyBadge state={value} /> },
    { title: '冻存位置', render: (_, row) => row.storageContainer ? `${row.storageContainer.code} / ${row.position || '-'}` : '待分配' },
    { title: '当前保管人', dataIndex: 'currentCustodian' },
    { title: '剩余体积/管数', render: (_, row) => `${row.volumeMl} mL / ${row.aliquotCount} 管` },
    { title: '接收时间', dataIndex: 'receivedAt', render: formatDateTime },
    { title: '操作', fixed: 'right', render: (_, row) => <Space><Button size="small" icon={<EyeOutlined />} onClick={() => void show(row)}>详情</Button>{(row.state === 'received' || row.state === 'aliquoted') && can('specimen:transition') && <Button size="small" icon={<ForkOutlined />} onClick={() => openAliquotModal(row)}>登记分装</Button>}</Space> },
  ]
  return (
    <div className="page-stack">
      <header className="page-header"><div><Typography.Title level={2}>样本队列</Typography.Title><Typography.Text type="secondary">接收科研样本并追踪冻存状态、责任人和来源协议</Typography.Text></div>{can('specimen:create') && <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>接收样本</Button>}</header>
      <div className="table-toolbar"><Input allowClear prefix={<SearchOutlined />} placeholder="搜索接收号、受试者编码或协议" value={search} onChange={(event) => setSearch(event.target.value)} onPressEnter={() => void refresh()} /><Select allowClear placeholder="全部状态" value={state} onChange={setState} options={[{ value: 'received', label: '已接收' }, { value: 'aliquoted', label: '已分装' }, { value: 'stored', label: '已冻存' }, { value: 'released', label: '已出库' }, { value: 'disposed', label: '已处置' }]} /><Button onClick={() => void refresh()}>查询</Button></div>
      <EntityTable columns={columns} dataSource={data.items} loading={loading} emptyTitle="暂无样本" emptyActionLabel={can('specimen:create') ? '接收首个样本' : undefined} onEmptyAction={() => setOpen(true)} pagination={{ current: pagination.page, pageSize: pagination.pageSize, total: data.total, showSizeChanger: true, onChange: pagination.update }} />
      <Modal width={680} title="接收新样本" open={open} confirmLoading={saving} onOk={() => void create()} onCancel={() => setOpen(false)} okText="确认接收" cancelText="取消">
        <Form form={form} layout="vertical" initialValues={{ aliquotCount: 1 }}>
          <Row gutter={16}><Col span={12}><Form.Item name="accessionNo" label="样本接收号" rules={[{ required: true, min: 3 }]}><Input placeholder="SP-20260822-001" /></Form.Item></Col><Col span={12}><Form.Item name="sampleType" label="样本类型" rules={[{ required: true }]}><Select options={[{ value: 'plasma', label: '血浆' }, { value: 'serum', label: '血清' }, { value: 'whole_blood', label: '全血' }, { value: 'tissue', label: '组织' }, { value: 'dna', label: 'DNA' }, { value: 'rna', label: 'RNA' }]} /></Form.Item></Col></Row>
          <Row gutter={16}><Col span={12}><Form.Item name="subjectCode" label="受试者脱敏编码" rules={[{ required: true, min: 3 }]}><Input placeholder="SUBJ-A032" /></Form.Item></Col><Col span={12}><Form.Item name="protocolCode" label="研究协议编号" rules={[{ required: true, min: 3 }]}><Input placeholder="PR-ONCO-2026-08" /></Form.Item></Col></Row>
          <Row gutter={16}><Col span={8}><Form.Item name="volumeMl" label="体积 (mL)" rules={[{ required: true }]}><InputNumber min={0.01} precision={2} style={{ width: '100%' }} /></Form.Item></Col><Col span={8}><Form.Item name="aliquotCount" label="分装份数" rules={[{ required: true }]}><InputNumber min={1} precision={0} style={{ width: '100%' }} /></Form.Item></Col><Col span={8}><Form.Item name="currentCustodian" label="接收保管人" rules={[{ required: true }]}><Input /></Form.Item></Col></Row>
          <Form.Item name="notes" label="接收备注"><Input.TextArea rows={3} maxLength={1000} showCount /></Form.Item>
        </Form>
      </Modal>
      <Modal width={720} title={`登记分装 · ${aliquotTarget?.accessionNo || ''}`} open={Boolean(aliquotTarget)} confirmLoading={saving} okButtonProps={{ disabled: exceeded }} onOk={() => void registerAliquots()} onCancel={() => setAliquotTarget(null)} okText="确认登记" cancelText="取消">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Text type="secondary">当前剩余体积 {remaining} mL，已登记 {aliquotTarget?.aliquotCount ?? 0} 管；本批合计 {batchTotal.toFixed(3)} mL，登记后剩余 {Math.max(remaining - batchTotal, 0).toFixed(3)} mL。</Typography.Text>
          {exceeded && <Alert type="error" showIcon message={`本批合计 ${batchTotal.toFixed(3)} mL 超过剩余体积 ${remaining} mL，请核减后再提交`} />}
          <Form form={aliquotForm} layout="vertical">
            <Form.List name="tubes">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field, index) => (
                    <Row gutter={12} key={field.key} align="middle">
                      <Col span={9}><Form.Item name={[field.name, 'tubeCode']} label={index === 0 ? '冻存管编号' : undefined} rules={[{ required: true, message: '请输入管编号' }, { min: 3, max: 50, message: '长度 3-50 字符' }]}><Input placeholder="BIO-20260822-004-A1" /></Form.Item></Col>
                      <Col span={6}><Form.Item name={[field.name, 'volumeMl']} label={index === 0 ? '体积 (mL)' : undefined} rules={[{ required: true, message: '请输入体积' }]}><InputNumber min={0.001} max={10000} precision={3} step={0.5} style={{ width: '100%' }} /></Form.Item></Col>
                      <Col span={7}><Form.Item name={[field.name, 'notes']} label={index === 0 ? '备注' : undefined}><Input maxLength={500} placeholder="可选" /></Form.Item></Col>
                      <Col span={2}><Button type="text" danger icon={<DeleteOutlined />} disabled={fields.length <= 1} onClick={() => remove(field.name)} /></Col>
                    </Row>
                  ))}
                  <Button block type="dashed" icon={<PlusOutlined />} disabled={fields.length >= 100} onClick={() => add({ tubeCode: aliquotTarget ? `${aliquotTarget.accessionNo}-A${(aliquotTarget.aliquotCount ?? 0) + fields.length + 1}` : '', notes: '' })}>添加一管</Button>
                </>
              )}
            </Form.List>
          </Form>
        </Space>
      </Modal>
      <SampleDrawer specimen={selected} open={Boolean(selected)} onClose={() => setSelected(null)} />
    </div>
  )
}

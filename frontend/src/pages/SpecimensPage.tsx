import { DeleteOutlined, EyeOutlined, ForkOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, Button, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Statistic, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo, useState } from 'react'
import { aliquotAPI, specimenAPI } from '../api'
import { CustodyBadge } from '../components/common/CustodyBadge'
import { EntityTable } from '../components/common/EntityTable'
import { SampleDrawer } from '../components/common/SampleDrawer'
import { useAuth } from '../hooks/useAuth'
import { usePagination } from '../hooks/usePagination'
import { useSpecimenStore } from '../stores/specimenStore'
import type { Specimen, SpecimenState } from '../types/domain'
import { formatDateTime } from '../utils/format'

interface AliquotRow { tubeCode: string; volumeMl: number | null }

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
  const [aliquotForm] = Form.useForm<{ tubes: AliquotRow[] }>()
  const refresh = () => load({ page: pagination.page, pageSize: pagination.pageSize, search, state })
  useEffect(() => { void refresh() }, [pagination.page, pagination.pageSize, state])

  const tubes = (Form.useWatch('tubes', aliquotForm) || []) as AliquotRow[]
  const batchTotal = useMemo(() => tubes.reduce((sum, row) => sum + (Number(row?.volumeMl) || 0), 0), [tubes])
  const remaining = aliquotTarget?.volumeMl ?? 0
  const overRemaining = batchTotal > remaining

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
  const openAliquotModal = (specimen: Specimen) => {
    setAliquotTarget(specimen)
    const nextIndex = specimen.aliquotCount + 1
    aliquotForm.setFieldsValue({
      tubes: [{ tubeCode: `${specimen.accessionNo}-T${String(nextIndex).padStart(2, '0')}`, volumeMl: null }],
    })
  }
  const registerAliquots = async () => {
    if (!aliquotTarget) return
    const values = await aliquotForm.validateFields()
    const payload = values.tubes.map((row) => ({ tubeCode: row.tubeCode.trim(), volumeMl: Number(row.volumeMl) }))
    setSaving(true)
    try {
      await aliquotAPI.register(aliquotTarget.id, payload)
      message.success(`已登记 ${payload.length} 支冻存管，父样本剩余体积同步扣减`)
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
    {
      title: '剩余体积 / 冻存管',
      render: (_, row) => (
        <Space size={4}>
          <Typography.Text strong>{row.volumeMl} mL</Typography.Text>
          <Typography.Text type="secondary">/</Typography.Text>
          <Typography.Text>{row.aliquotCount} 管</Typography.Text>
          <Typography.Text type="secondary">(接收 {row.initialVolumeMl || row.volumeMl} mL)</Typography.Text>
        </Space>
      ),
    },
    { title: '接收时间', dataIndex: 'receivedAt', render: formatDateTime },
    {
      title: '操作', fixed: 'right',
      render: (_, row) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => void show(row)}>详情</Button>
          {(row.state === 'received' || row.state === 'aliquoted') && can('specimen:transition') &&
            <Button size="small" type="primary" ghost icon={<ForkOutlined />} onClick={() => openAliquotModal(row)}>登记分装</Button>}
        </Space>
      ),
    },
  ]
  return (
    <div className="page-stack">
      <header className="page-header"><div><Typography.Title level={2}>样本队列</Typography.Title><Typography.Text type="secondary">接收科研样本，按冻存管登记分装编号与每管体积，追踪剩余体积和管数</Typography.Text></div>{can('specimen:create') && <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>接收样本</Button>}</header>
      <div className="table-toolbar"><Input allowClear prefix={<SearchOutlined />} placeholder="搜索接收号、受试者编码或协议" value={search} onChange={(event) => setSearch(event.target.value)} onPressEnter={() => void refresh()} /><Select allowClear placeholder="全部状态" value={state} onChange={setState} options={[{ value: 'received', label: '已接收' }, { value: 'aliquoted', label: '已分装' }, { value: 'stored', label: '已冻存' }, { value: 'released', label: '已出库' }, { value: 'disposed', label: '已处置' }]} /><Button onClick={() => void refresh()}>查询</Button></div>
      <EntityTable columns={columns} dataSource={data.items} loading={loading} emptyTitle="暂无样本" emptyActionLabel={can('specimen:create') ? '接收首个样本' : undefined} onEmptyAction={() => setOpen(true)} pagination={{ current: pagination.page, pageSize: pagination.pageSize, total: data.total, showSizeChanger: true, onChange: pagination.update }} />
      <Modal width={680} title="接收新样本" open={open} confirmLoading={saving} onOk={() => void create()} onCancel={() => setOpen(false)} okText="确认接收" cancelText="取消">
        <Form form={form} layout="vertical">
          <Row gutter={16}><Col span={12}><Form.Item name="accessionNo" label="样本接收号" rules={[{ required: true, min: 3 }]}><Input placeholder="SP-20260822-001" /></Form.Item></Col><Col span={12}><Form.Item name="sampleType" label="样本类型" rules={[{ required: true }]}><Select options={[{ value: 'plasma', label: '血浆' }, { value: 'serum', label: '血清' }, { value: 'whole_blood', label: '全血' }, { value: 'tissue', label: '组织' }, { value: 'dna', label: 'DNA' }, { value: 'rna', label: 'RNA' }]} /></Form.Item></Col></Row>
          <Row gutter={16}><Col span={12}><Form.Item name="subjectCode" label="受试者脱敏编码" rules={[{ required: true, min: 3 }]}><Input placeholder="SUBJ-A032" /></Form.Item></Col><Col span={12}><Form.Item name="protocolCode" label="研究协议编号" rules={[{ required: true, min: 3 }]}><Input placeholder="PR-ONCO-2026-08" /></Form.Item></Col></Row>
          <Row gutter={16}><Col span={12}><Form.Item name="volumeMl" label="接收体积 (mL)" rules={[{ required: true }]}><InputNumber min={0.01} precision={3} style={{ width: '100%' }} /></Form.Item></Col><Col span={12}><Form.Item name="currentCustodian" label="接收保管人" rules={[{ required: true }]}><Input /></Form.Item></Col></Row>
          <Form.Item name="notes" label="接收备注"><Input.TextArea rows={3} maxLength={1000} showCount /></Form.Item>
        </Form>
      </Modal>
      <Modal
        width={820}
        title={`登记分装冻存管 · ${aliquotTarget?.accessionNo || ''}`}
        open={Boolean(aliquotTarget)}
        confirmLoading={saving}
        onOk={() => void registerAliquots()}
        onCancel={() => setAliquotTarget(null)}
        okText="确认登记"
        cancelText="取消"
        okButtonProps={{ disabled: overRemaining || tubes.length === 0 }}
      >
        {aliquotTarget && <Space style={{ marginBottom: 16 }} size={48}>
          <Statistic title="当前剩余体积" value={remaining} precision={3} suffix="mL" />
          <Statistic title="本批合计" value={batchTotal} precision={3} suffix="mL" valueStyle={{ color: overRemaining ? '#cf1322' : undefined }} />
          <Statistic title="登记后剩余" value={Math.max(remaining - batchTotal, 0)} precision={3} suffix="mL" />
          <Statistic title="已登记管数" value={aliquotTarget.aliquotCount} suffix="管" />
        </Space>}
        {overRemaining && <Alert style={{ marginBottom: 16 }} type="error" showIcon message="本批各管体积合计超过剩余体积，整批将不会写入，父样本保持原样。" />}
        <Form form={aliquotForm} layout="vertical">
          <Form.List name="tubes">
            {(fields, { add, remove }) => (
              <Space direction="vertical" style={{ display: 'flex' }} size={8}>
                {fields.map(({ key, name, ...restField }) => (
                  <Row gutter={12} key={key} align="top">
                    <Col span={13}>
                      <Form.Item {...restField} name={[name, 'tubeCode']} label={name === 0 ? '冻存管编号' : ' '} rules={[{ required: true, min: 3, max: 50, whitespace: true }]}>
                        <Input placeholder="SP-20260822-001-T01" />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item {...restField} name={[name, 'volumeMl']} label={name === 0 ? '每管体积 (mL)' : ' '} rules={[{ required: true, type: 'number', min: 0.001, max: 100000 }]}>
                        <InputNumber min={0.001} precision={3} step={0.1} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={3}>
                      {name === 0 ? <div className="ant-form-item-label" style={{ height: 32 }}>&nbsp;</div> : null}
                      <Button danger type="text" icon={<DeleteOutlined />} disabled={fields.length === 1} onClick={() => remove(name)} />
                    </Col>
                  </Row>
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} disabled={tubes.length >= 100} onClick={() => {
                  const index = (aliquotTarget?.aliquotCount || 0) + fields.length + 1
                  add({ tubeCode: aliquotTarget ? `${aliquotTarget.accessionNo}-T${String(index).padStart(2, '0')}` : '', volumeMl: null })
                }}>添加一支冻存管</Button>
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>
      <SampleDrawer specimen={selected} open={Boolean(selected)} onClose={() => setSelected(null)} />
    </div>
  )
}

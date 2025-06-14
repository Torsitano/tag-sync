import { CreateTagsCommand, EC2Client, Tag, Instance, paginateDescribeInstances, paginateDescribeVolumes, Volume, DeleteTagsCommand, Snapshot, paginateDescribeSnapshots } from '@aws-sdk/client-ec2'
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'

export interface ApplyTagsOptions {
    ec2Client: EC2Client
    resourceIds: string[]
    tags: Tag[]
    isDryRun: boolean
    resourceType: string
    resourceName?: string
}

export async function applyTagsToResources( options: ApplyTagsOptions ): Promise<void> {
    const { ec2Client, resourceIds, tags, isDryRun, resourceType, resourceName } = options

    if ( tags.length === 0 ) {
        console.log( `No tags to apply to ${resourceType}${resourceName ? ` '${resourceName}'` : ''}` )
        return
    }

    const resourceDescription = resourceName ? `${resourceType} '${resourceName}'` : `${resourceType}(s)`
    console.log( `Applying tags to ${resourceDescription}` )

    if ( isDryRun ) {
        console.log( `DRY RUN: Would apply tags to ${resourceDescription}:` )
        console.dir( tags )
        return
    }

    const command = new CreateTagsCommand( {
        Resources: resourceIds,
        Tags: tags,
    } )

    await ec2Client.send( command )
    console.log( `Tags applied to ${resourceDescription}` )
}

export async function deleteTagsFromResources( options: ApplyTagsOptions ): Promise<void> {
    const { ec2Client, resourceIds, tags, isDryRun, resourceType, resourceName } = options

    if ( tags.length === 0 ) {
        console.log( `No tags to delete from ${resourceType}${resourceName ? ` '${resourceName}'` : ''}` )
        return
    }

    const resourceDescription = resourceName ? `${resourceType} '${resourceName}'` : `${resourceType}(s)`
    console.log( `Deleting tags from ${resourceDescription}` )

    if ( isDryRun ) {
        console.log( `DRY RUN: Would delete tags from ${resourceDescription}:` )
        console.dir( tags )
        return
    }

    const command = new DeleteTagsCommand( {
        Resources: resourceIds,
        Tags: tags,
    } )

    await ec2Client.send( command )
    console.log( `Tags deleted from ${resourceDescription}` )
}

export async function getTagsFromSssm( ssmClient: SSMClient ): Promise<Map<string, string>> {
    const command = new GetParameterCommand( {
        Name: '/tag-sync/tags',
    } )

    const response = await ssmClient.send( command )

    if ( !response.Parameter || !response.Parameter.Value ) {
        throw new Error( `Parameter /tag-sync/tags not found or has no value` )
    }

    const parsedTags: Record<string, string> = JSON.parse( response.Parameter.Value )
    return new Map( Object.entries( parsedTags ) )
}

export async function listEc2Instances( ec2Client: EC2Client ): Promise<Instance[]> {
    const paginator = paginateDescribeInstances( { client: ec2Client }, {} )
    const instances: Instance[] = []
    for await ( const page of paginator ) {
        const reservations = page.Reservations!

        for ( const reservation of reservations ) {
            instances.push( ...reservation.Instances! )
        }
    }

    return instances
}

export async function listVolumes( ec2Client: EC2Client ): Promise<Map<string, Volume>> {
    const paginator = paginateDescribeVolumes( { client: ec2Client }, {} )

    const volumeMap = new Map<string, Volume>()

    for await ( const page of paginator ) {
        const volumeList = page.Volumes!

        for ( const volume of volumeList ) {
            volumeMap.set( volume.VolumeId!, volume )
        }
    }
    return volumeMap
}

export async function listSnapshots( ec2Client: EC2Client ): Promise<Map<string, Snapshot>> {
    const paginator = paginateDescribeSnapshots( { client: ec2Client }, {
        OwnerIds: [ 'self' ],
        Filters: [ {
            Name: 'status',
            Values: [ 'completed' ]
        } ]
    } )
    const snapshotMap = new Map<string, Snapshot>()

    for await ( const page of paginator ) {
        const snapshotList = page.Snapshots!

        for ( const snapshot of snapshotList ) {
            snapshotMap.set( snapshot.SnapshotId!, snapshot )
        }
    }

    return snapshotMap
}